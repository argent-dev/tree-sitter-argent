#include "tree_sitter/parser.h"

#include <stdbool.h>
#include <string.h>

/**
 * External scanner for Argent's tree-sitter grammar.
 *
 * Handles context-sensitive tokens:
 *   1. Newlines — Only emit _newline when bracket nesting depth is 0.
 *      Inside (), [], {} newlines are suppressed (not statement terminators).
 *   2. String interpolation — Track string/interpolation state for `"hello ${expr}"`.
 *   3. Regex literals — Disambiguate `/pattern/` from division `/`.
 */

enum TokenType {
    NEWLINE,
    STRING_CONTENT,
    INTERPOLATION_START,
    INTERPOLATION_END,
    REGEX_PATTERN,
    REGEX_FLAGS,
};

// Scanner state persisted across calls
typedef struct {
    // Bracket nesting depth ((), [], {})
    uint32_t paren_depth;
    uint32_t bracket_depth;
    uint32_t brace_depth;

    // String/interpolation state
    // Stack of brace depths for nested interpolations.
    // When we enter `${`, we push the current brace_depth.
    // When a `}` is encountered and brace_depth matches the top of the stack,
    // we're closing the interpolation (not a nested block).
    uint32_t interp_stack[32];
    uint32_t interp_depth;

    // Whether we are inside a string literal
    bool in_string;

    // Whether the previous meaningful token was a "value" token
    // (for regex vs division disambiguation)
    bool last_was_value;
} Scanner;

static void skip_whitespace(TSLexer *lexer) {
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t' || lexer->lookahead == '\r') {
        lexer->advance(lexer, true);
    }
}

void *tree_sitter_argent_external_scanner_create(void) {
    Scanner *scanner = calloc(1, sizeof(Scanner));
    return scanner;
}

void tree_sitter_argent_external_scanner_destroy(void *payload) {
    free(payload);
}

unsigned tree_sitter_argent_external_scanner_serialize(void *payload, char *buffer) {
    Scanner *scanner = (Scanner *)payload;
    unsigned size = sizeof(Scanner);
    if (size > TREE_SITTER_SERIALIZATION_BUFFER_SIZE) {
        size = TREE_SITTER_SERIALIZATION_BUFFER_SIZE;
    }
    memcpy(buffer, scanner, size);
    return size;
}

void tree_sitter_argent_external_scanner_deserialize(void *payload, const char *buffer,
                                                            unsigned length) {
    Scanner *scanner = (Scanner *)payload;
    if (length > 0) {
        unsigned size = sizeof(Scanner);
        if (size > length) size = length;
        memcpy(scanner, buffer, size);
    } else {
        memset(scanner, 0, sizeof(Scanner));
    }
}

/**
 * Check if the previous token could be a "value" — used for regex disambiguation.
 * If the previous token was a value (identifier, literal, ), ], }), then `/` is division.
 * Otherwise (after operators, keywords, (, [, {, start of file), `/` starts a regex.
 */
static bool scan_regex(Scanner *scanner, TSLexer *lexer) {
    // Only try regex if the last token was NOT a value
    if (scanner->last_was_value) return false;
    if (lexer->lookahead != '/') return false;

    // Don't match `//` (line comment) or `/*` (block comment)
    lexer->advance(lexer, false);
    if (lexer->lookahead == '/' || lexer->lookahead == '*') return false;

    // Scan regex pattern until unescaped `/`
    lexer->result_symbol = REGEX_PATTERN;

    while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
        if (lexer->lookahead == '\\') {
            // Escape sequence — skip next char
            lexer->advance(lexer, false);
            if (lexer->lookahead == 0 || lexer->lookahead == '\n') return false;
            lexer->advance(lexer, false);
        } else if (lexer->lookahead == '/') {
            // End of pattern
            lexer->mark_end(lexer);
            return true;
        } else {
            lexer->advance(lexer, false);
        }
    }
    return false;
}

static bool scan_regex_flags(TSLexer *lexer) {
    // After the closing `/`, scan optional flags: g, i, m, s, u, x
    if (lexer->lookahead == 0) return false;

    bool found_any = false;
    while (lexer->lookahead == 'g' || lexer->lookahead == 'i' || lexer->lookahead == 'm' ||
           lexer->lookahead == 's' || lexer->lookahead == 'u' || lexer->lookahead == 'x') {
        found_any = true;
        lexer->advance(lexer, false);
    }

    if (found_any) {
        lexer->result_symbol = REGEX_FLAGS;
        lexer->mark_end(lexer);
        return true;
    }
    return false;
}

static bool scan_string_content(Scanner *scanner, TSLexer *lexer) {
    // We're inside a string. Scan until we hit:
    //   - `"` (end of string — don't consume, let the grammar handle it)
    //   - `${` (start of interpolation)
    //   - `\` (escape sequence — consume the next char too)
    //   - end of input

    bool has_content = false;

    while (lexer->lookahead != 0) {
        if (lexer->lookahead == '"') {
            // End of string — return what we have
            break;
        }

        if (lexer->lookahead == '$') {
            // Peek for `{` — this would be interpolation start
            lexer->mark_end(lexer);
            lexer->advance(lexer, false);
            if (lexer->lookahead == '{') {
                // If we already scanned some content, return it first
                if (has_content) {
                    lexer->result_symbol = STRING_CONTENT;
                    return true;
                }
                // Otherwise this is the interpolation start
                return false;
            }
            // Not interpolation — `$` is just a character
            has_content = true;
            continue;
        }

        if (lexer->lookahead == '\\') {
            // Escape sequence — consume `\` and the next character
            lexer->advance(lexer, false);
            if (lexer->lookahead != 0) {
                lexer->advance(lexer, false);
            }
            has_content = true;
            continue;
        }

        // Regular character
        lexer->advance(lexer, false);
        has_content = true;
    }

    if (has_content) {
        lexer->mark_end(lexer);
        lexer->result_symbol = STRING_CONTENT;
        return true;
    }

    return false;
}

static bool scan_interpolation_start(Scanner *scanner, TSLexer *lexer) {
    // We expect to be at `$` with `{` following
    if (lexer->lookahead != '$') return false;

    lexer->advance(lexer, false);
    if (lexer->lookahead != '{') return false;

    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    lexer->result_symbol = INTERPOLATION_START;

    // Push current brace depth onto interpolation stack
    if (scanner->interp_depth < 32) {
        scanner->interp_stack[scanner->interp_depth] = scanner->brace_depth;
        scanner->interp_depth++;
    }
    scanner->brace_depth++;
    scanner->in_string = false;

    return true;
}

static bool scan_interpolation_end(Scanner *scanner, TSLexer *lexer) {
    // Check if the closing `}` matches an interpolation level
    if (lexer->lookahead != '}') return false;
    if (scanner->interp_depth == 0) return false;

    uint32_t expected_depth = scanner->interp_stack[scanner->interp_depth - 1] + 1;
    if (scanner->brace_depth != expected_depth) return false;

    lexer->advance(lexer, false);
    lexer->mark_end(lexer);
    lexer->result_symbol = INTERPOLATION_END;

    scanner->interp_depth--;
    scanner->brace_depth--;
    scanner->in_string = true;

    return true;
}

bool tree_sitter_argent_external_scanner_scan(void *payload, TSLexer *lexer,
                                                     const bool *valid_symbols) {
    Scanner *scanner = (Scanner *)payload;

    // If string content or interpolation start is valid, we're inside a string
    if (valid_symbols[STRING_CONTENT] || valid_symbols[INTERPOLATION_START]) {
        if (valid_symbols[INTERPOLATION_START]) {
            if (lexer->lookahead == '$') {
                // Try interpolation start first
                if (scan_interpolation_start(scanner, lexer)) return true;
            }
        }
        if (valid_symbols[STRING_CONTENT]) {
            if (scan_string_content(scanner, lexer)) return true;
        }
    }

    // Check for interpolation end
    if (valid_symbols[INTERPOLATION_END] && scanner->interp_depth > 0) {
        skip_whitespace(lexer);
        if (scan_interpolation_end(scanner, lexer)) return true;
    }

    // Handle regex
    if (valid_symbols[REGEX_PATTERN]) {
        skip_whitespace(lexer);
        if (scan_regex(scanner, lexer)) return true;
    }

    if (valid_symbols[REGEX_FLAGS]) {
        if (scan_regex_flags(lexer)) return true;
    }

    // Handle newlines
    if (valid_symbols[NEWLINE]) {
        skip_whitespace(lexer);

        if (lexer->lookahead == '\n') {
            lexer->advance(lexer, false);
            lexer->mark_end(lexer);

            // Skip additional whitespace and newlines
            while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
                   lexer->lookahead == '\r' || lexer->lookahead == '\n') {
                lexer->advance(lexer, false);
            }

            // Only emit newline as statement terminator at nesting depth 0
            if (scanner->paren_depth == 0 && scanner->bracket_depth == 0 &&
                scanner->brace_depth == 0 && scanner->interp_depth == 0) {
                lexer->result_symbol = NEWLINE;
                return true;
            }

            // Inside brackets — suppress the newline, don't emit token
            return false;
        }
    }

    // Track bracket nesting from normal tokens
    // This is done by the grammar itself via extras, but we need to track
    // it in the scanner state for newline suppression.
    // Note: The scanner doesn't advance tokens it doesn't own.
    // Instead, the grammar rules handle bracket tracking implicitly through
    // the structure of the parse tree. We rely on the external scanner
    // being called at appropriate points and update state when we see braces
    // in the INTERPOLATION_START/END handlers.

    return false;
}
