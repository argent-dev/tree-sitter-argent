; Keywords
[
  "let"
  "mut"
  "const"
  "fn"
  "struct"
  "enum"
  "trait"
  "impl"
  "if"
  "else"
  "while"
  "for"
  "in"
  "loop"
  "match"
  "return"
  "break"
  "continue"
  "defer"
  "use"
  "pub"
  "spawn"
  "select"
  "move"
  "type"
  "static"
] @keyword

["as" "as!"] @keyword.operator

; Literals
(integer_literal) @number
(float_literal) @number.float
(string_literal) @string
(interpolated_string) @string
(char_literal) @character
(bool_literal) @boolean
(regex_literal) @string.regex

; Interpolation
(interpolation) @embedded

; Types
(primitive_type) @type.builtin
(type_identifier) @type
(generic_type name: (identifier) @type)
(type_parameter name: (identifier) @type)
(trait_bound trait_name: (identifier) @type)

; Struct / Enum / Trait names
(struct_declaration name: (identifier) @type)
(enum_declaration name: (identifier) @type)
(trait_declaration name: (identifier) @type)
(impl_block trait_or_type: (identifier) @type)
(impl_block target_type: (identifier) @type)
(type_alias name: (identifier) @type)

; Enum variants
(enum_variant name: (identifier) @constant)
(path_expression (identifier) @type . "::" . (identifier) @constant)
(enum_variant_pattern enum_name: (identifier) @type)
(enum_variant_pattern variant_name: (identifier) @constant)

; Functions
(function_declaration name: (identifier) @function)
(impl_method name: (identifier) @function.method)
(trait_method name: (identifier) @function.method)
(call_expression callee: (identifier) @function.call)
(method_call method: (identifier) @function.method.call)

; Parameters
(typed_parameter name: (identifier) @variable.parameter)
(closure_parameter name: (identifier) @variable.parameter)
(self_parameter) @variable.builtin
(spawn_parameter name: (identifier) @variable.parameter)

; Variables
(let_declaration name: (identifier) @variable)
(const_declaration name: (identifier) @constant)
(for_in_statement binding: (identifier) @variable)

; Field access
(field_access field: (identifier) @property)
(struct_field name: (identifier) @property)
(struct_field_value field: (identifier) @property)

; Comments
(line_comment) @comment.line
(block_comment) @comment.block

; Attributes
(attribute name: (identifier) @attribute)
(attribute "#[" @punctuation.special)
(attribute "]" @punctuation.special)

; Operators
[
  "+"
  "-"
  "*"
  "/"
  "%"
  "=="
  "!="
  "<"
  "<="
  ">"
  ">="
  "&&"
  "||"
  "!"
  "&"
  "|"
  "^"
  "<<"
  ">>"
  "="
  "+="
  "-="
  "*="
  "/="
  "%="
  ".."
  "..="
  "->"
  "=>"
  "?"
] @operator

; Punctuation - delimiters
[
  "("
  ")"
  "{"
  "}"
  "["
  "]"
] @punctuation.bracket

; Punctuation - other
[
  ","
  ":"
  "::"
  "."
  ";"
] @punctuation.delimiter

; Special tokens
"#{"  @punctuation.special

; Identifiers (fallback)
(identifier) @variable
