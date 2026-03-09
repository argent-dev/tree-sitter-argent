/// <reference types="tree-sitter-cli/dsl" />

// Precedence levels (higher = binds tighter)
const PREC = {
	ASSIGN: 1,
	RANGE: 2,
	OR: 3,
	AND: 4,
	BIT_OR: 5,
	BIT_XOR: 6,
	BIT_AND: 7,
	EQUALITY: 8,
	COMPARISON: 9,
	SHIFT: 10,
	ADDITIVE: 11,
	MULTIPLICATIVE: 12,
	CAST: 13,
	UNARY: 14,
	TRY: 15,
	CALL: 16,
	MEMBER: 17,
};

const PRIMITIVE_TYPES = [
	'i8', 'i16', 'i32', 'i64',
	'u8', 'u16', 'u32', 'u64',
	'f32', 'f64',
	'bool', 'string', 'char', 'void',
];

module.exports = grammar({
	name: 'argent',

	extras: $ => [
		/[\s]/,
		$.line_comment,
		$.block_comment,
	],

	externals: $ => [
		$._newline,  // kept for scanner compatibility but unused
		$._string_content,
		$._interpolation_start,
		$._interpolation_end,
		$._regex_pattern,
		$._regex_flags,
	],

	word: $ => $.identifier,

	supertypes: $ => [
		$._expression,
		$._statement,
		$._type,
		$._pattern,
	],

	inline: $ => [
		$._statement_terminator,
	],

	conflicts: $ => [
		// Struct literal vs block ambiguities
		[$._expression, $.struct_literal],
		[$._expression, $.path_expression],
		[$.struct_literal, $.block],
		[$._expression, $.struct_field_value],
		[$.expression_statement, $.block],
		// Pattern ambiguities
		[$.rest_pattern, $.range_pattern],
		[$.array_destructure, $.binding_pattern],
		[$.array_destructure, $.slice_pattern],
		[$.or_pattern, $.at_binding_pattern],
		[$._let_binding, $.binding_pattern],
		// Closure ambiguities
		[$._expression, $.closure],
		[$._expression, $.closure_parameter],
		// Arm body vs trailing expression
		[$._expression, $.select_default_arm],
		[$._expression, $.select_arm],
		[$._expression, $.match_arm],
		// Type ambiguities
		[$.function_type, $.associated_type],
	],

	rules: {
		source_file: $ => repeat(seq($._statement, optional($._statement_terminator))),

		// --------------- Statement terminator ---------------

		_statement_terminator: $ => ';',

		// --------------- Statements ---------------

		_statement: $ => choice(
			$.let_declaration,
			$.const_declaration,
			$.type_alias,
			$.function_declaration,
			$.struct_declaration,
			$.enum_declaration,
			$.trait_declaration,
			$.impl_block,
			$.use_declaration,
			$.for_in_statement,
			$.while_statement,
			$.loop_statement,
			$.return_statement,
			$.break_statement,
			$.continue_statement,
			$.defer_statement,
			$.assignment,
			$.compound_assignment,
			$.expression_statement,
		),

		expression_statement: $ => $._expression,

		// --------------- Let declarations ---------------

		let_declaration: $ => choice(
			$._let_binding,
			$._let_destructure_tuple,
			$._let_destructure_pattern,
			$.let_else,
		),

		_let_binding: $ => seq(
			'let',
			optional('mut'),
			field('name', $.identifier),
			optional(seq(':', field('type', $._type))),
			'=',
			field('value', $._expression),
		),

		_let_destructure_tuple: $ => seq(
			'let',
			optional('mut'),
			'(',
			commaSep1(field('name', $.identifier)),
			optional(','),
			')',
			'=',
			field('value', $._expression),
		),

		_let_destructure_pattern: $ => seq(
			'let',
			optional('mut'),
			field('pattern', $.destructure_pattern),
			'=',
			field('value', $._expression),
		),

		let_else: $ => seq(
			'let',
			field('pattern', $._pattern),
			'=',
			field('value', $._expression),
			'else',
			field('else_body', $.block),
		),

		// --------------- Destructure patterns (for let bindings) ---------------

		destructure_pattern: $ => choice(
			$.struct_destructure,
			$.array_destructure,
		),

		struct_destructure: $ => seq(
			'{',
			commaSep1($.struct_destructure_field),
			optional(','),
			'}',
		),

		struct_destructure_field: $ => seq(
			field('field', $.identifier),
			optional(seq(':', field('pattern', choice($.identifier, $.destructure_pattern)))),
		),

		array_destructure: $ => seq(
			'[',
			commaSep1(choice(
				$.identifier,
				$.destructure_pattern,
				$.rest_pattern,
			)),
			optional(','),
			']',
		),

		rest_pattern: $ => seq('..', optional($.identifier)),

		// --------------- Const declarations ---------------

		const_declaration: $ => seq(
			'const',
			field('name', $.identifier),
			optional(seq(':', field('type', $._type))),
			'=',
			field('value', $._expression),
		),

		// --------------- Type alias ---------------

		type_alias: $ => seq(
			optional('pub'),
			'type',
			field('name', $.identifier),
			optional($.type_parameters),
			optional(seq('=', field('target', $._type))),
		),

		// --------------- Assignment ---------------

		assignment: $ => prec.right(PREC.ASSIGN, seq(
			field('target', $._expression),
			'=',
			field('value', $._expression),
		)),

		compound_assignment: $ => prec.right(PREC.ASSIGN, seq(
			field('target', $._expression),
			field('operator', choice('+=', '-=', '*=', '/=', '%=')),
			field('value', $._expression),
		)),

		// --------------- Function declarations ---------------

		function_declaration: $ => prec.right(seq(
			repeat($.attribute),
			optional('pub'),
			'fn',
			field('name', $.identifier),
			optional($.type_parameters),
			field('parameters', $.parameter_list),
			optional(seq('->', field('return_type', $._type))),
			optional(field('body', $.block)),
		)),

		parameter_list: $ => seq(
			'(',
			optional(commaSep1($.parameter)),
			optional(','),
			')',
		),

		parameter: $ => choice(
			$.self_parameter,
			$.typed_parameter,
			$.destructured_parameter,
		),

		self_parameter: $ => 'self',

		typed_parameter: $ => seq(
			field('name', $.identifier),
			':',
			field('type', $._type),
			optional(seq('=', field('default', $._expression))),
		),

		destructured_parameter: $ => seq(
			field('pattern', $.destructure_pattern),
			':',
			field('type', $._type),
		),

		// --------------- Struct declarations ---------------

		struct_declaration: $ => prec.right(seq(
			repeat($.attribute),
			optional('pub'),
			'struct',
			field('name', $.identifier),
			optional($.type_parameters),
			optional($.struct_body),
		)),

		struct_body: $ => seq(
			'{',
			optional(commaSepNl($.struct_field)),
			optional(','),
			'}',
		),

		struct_field: $ => seq(
			repeat($.attribute),
			field('name', $.identifier),
			':',
			field('type', $._type),
			optional(seq('=', field('default', $._expression))),
		),

		// --------------- Enum declarations ---------------

		enum_declaration: $ => seq(
			repeat($.attribute),
			optional('pub'),
			'enum',
			field('name', $.identifier),
			optional($.type_parameters),
			'{',
			optional(commaSepNl($.enum_variant)),
			optional(','),
			'}',
		),

		enum_variant: $ => seq(
			field('name', $.identifier),
			optional(choice(
				$.enum_tuple_body,
				$.enum_struct_body,
			)),
		),

		enum_tuple_body: $ => seq(
			'(',
			commaSep1($._type),
			optional(','),
			')',
		),

		enum_struct_body: $ => seq(
			'{',
			optional(commaSepNl($.struct_field)),
			optional(','),
			'}',
		),

		// --------------- Trait declarations ---------------

		trait_declaration: $ => seq(
			optional('pub'),
			'trait',
			field('name', $.identifier),
			optional($.type_parameters),
			optional($.supertrait_clause),
			'{',
			repeat(choice(
				$.trait_method,
				$.associated_type_declaration,
			)),
			'}',
		),

		supertrait_clause: $ => seq(
			':',
			$.identifier,
			repeat(seq('+', $.identifier)),
		),

		trait_method: $ => seq(
			repeat($.attribute),
			'fn',
			field('name', $.identifier),
			optional($.type_parameters),
			field('parameters', $.parameter_list),
			optional(seq('->', field('return_type', $._type))),
			optional(field('body', $.block)),
		),

		associated_type_declaration: $ => seq('type', field('name', $.identifier)),

		// --------------- Impl blocks ---------------

		impl_block: $ => seq(
			'impl',
			optional($.type_parameters),
			field('trait_or_type', $.identifier),
			optional($.type_arguments),
			optional(seq('for', field('target_type', $.identifier), optional($.type_arguments))),
			'{',
			repeat(choice(
				$.impl_method,
				$.associated_type_definition,
			)),
			'}',
		),

		impl_method: $ => seq(
			repeat($.attribute),
			optional('pub'),
			optional('static'),
			'fn',
			field('name', $.identifier),
			optional($.type_parameters),
			field('parameters', $.parameter_list),
			optional(seq('->', field('return_type', $._type))),
			optional(field('body', $.block)),
		),

		associated_type_definition: $ => seq(
			'type',
			field('name', $.identifier),
			'=',
			field('type', $._type),
		),

		// --------------- Use declarations ---------------

		use_declaration: $ => seq(
			optional('pub'),
			'use',
			$.use_path,
		),

		use_path: $ => seq(
			$.identifier,
			repeat(seq('::', $.identifier)),
			optional(seq('::', $.use_list)),
		),

		use_list: $ => seq(
			'{',
			commaSep1($.identifier),
			optional(','),
			'}',
		),

		// --------------- Control flow statements ---------------

		for_in_statement: $ => seq(
			'for',
			field('binding', $.identifier),
			'in',
			field('iterable', $._expression),
			field('body', $.block),
		),

		while_statement: $ => seq(
			'while',
			field('condition', $._expression),
			field('body', $.block),
		),

		loop_statement: $ => seq(
			'loop',
			field('body', $.block),
		),

		return_statement: $ => prec.right(seq(
			'return',
			optional(field('value', $._expression)),
		)),

		break_statement: $ => prec.right('break'),

		continue_statement: $ => prec.right('continue'),

		defer_statement: $ => seq(
			'defer',
			field('expression', $._expression),
		),

		// --------------- Expressions ---------------

		_expression: $ => choice(
			$.identifier,
			$.integer_literal,
			$.float_literal,
			$.string_literal,
			$.interpolated_string,
			$.char_literal,
			$.bool_literal,
			$.array_literal,
			$.array_repeat,
			$.tuple_expression,
			$.hashmap_literal,
			$.hashset_literal,
			$.struct_literal,
			$.grouped_expression,
			$.block,
			$.unary_expression,
			$.binary_expression,
			$.range_expression,
			$.cast_expression,
			$.try_expression,
			$.call_expression,
			$.method_call,
			$.field_access,
			$.index_expression,
			$.slice_expression,
			$.closure,
			$.if_expression,
			$.match_expression,
			$.spawn_expression,
			$.select_expression,
			$.regex_literal,
			$.path_expression,
		),

		// --------------- Literals ---------------

		integer_literal: $ => token(choice(
			// Hex
			seq('0x', /[0-9a-fA-F][0-9a-fA-F_]*/),
			// Octal
			seq('0o', /[0-7][0-7_]*/),
			// Binary
			seq('0b', /[01][01_]*/),
			// Decimal with optional suffix
			seq(/[0-9][0-9_]*/, optional(choice(
				'i8', 'i16', 'i32', 'i64',
				'u8', 'u16', 'u32', 'u64',
			))),
		)),

		float_literal: $ => token(choice(
			seq(
				/[0-9][0-9_]*/,
				'.',
				/[0-9][0-9_]*/,
				optional(seq(/[eE]/, optional(/[+-]/), /[0-9]+/)),
				optional(choice('f32', 'f64')),
			),
			seq(
				/[0-9][0-9_]*/,
				/[eE]/,
				optional(/[+-]/),
				/[0-9]+/,
				optional(choice('f32', 'f64')),
			),
			seq(
				/[0-9][0-9_]*/,
				choice('f32', 'f64'),
			),
		)),

		string_literal: $ => seq(
			'"',
			repeat($._string_content),
			'"',
		),

		interpolated_string: $ => seq(
			'"',
			repeat($._string_content),
			repeat1(seq(
				$.interpolation,
				repeat($._string_content),
			)),
			'"',
		),

		interpolation: $ => seq(
			$._interpolation_start,  // ${
			field('expression', $._expression),
			$._interpolation_end,    // }
		),

		char_literal: $ => seq(
			"'",
			choice(
				$.escape_sequence,
				/[^'\\]/,
			),
			"'",
		),

		escape_sequence: $ => token.immediate(seq(
			'\\',
			choice(
				'n', 'r', 't', '\\', "'", '"', '0',
				seq('x', /[0-9a-fA-F]{2}/),
				seq('u', '{', /[0-9a-fA-F]+/, '}'),
			),
		)),

		bool_literal: $ => choice('true', 'false'),

		regex_literal: $ => seq(
			'/',
			$._regex_pattern,
			'/',
			optional($._regex_flags),
		),

		// --------------- Collection literals ---------------

		array_literal: $ => seq(
			'[',
			optional(seq(
				commaSep1($._expression),
				optional(','),
			)),
			']',
		),

		array_repeat: $ => seq(
			'[',
			field('value', $._expression),
			';',
			field('count', $._expression),
			']',
		),

		tuple_expression: $ => choice(
			// Single element tuple requires trailing comma
			seq('(', $._expression, ',', ')'),
			// Multi-element tuple
			seq('(', $._expression, repeat1(seq(',', $._expression)), optional(','), ')'),
		),

		hashmap_literal: $ => seq(
			'#{',
			optional(seq(
				commaSep1($.hashmap_entry),
				optional(','),
			)),
			'}',
		),

		hashmap_entry: $ => seq(
			field('key', $._expression),
			':',
			field('value', $._expression),
		),

		hashset_literal: $ => seq(
			'#{',
			commaSep1($._expression),
			optional(','),
			'}',
		),

		struct_literal: $ => seq(
			optional(field('name', $.identifier)),
			'{',
			optional(seq(
				commaSep1($.struct_field_value),
				optional(','),
			)),
			optional(seq('..', field('base', $._expression))),
			'}',
		),

		struct_field_value: $ => choice(
			// Full: `field: value`
			seq(field('field', $.identifier), ':', field('value', $._expression)),
			// Shorthand: `field` (use variable with same name)
			field('field', $.identifier),
		),

		grouped_expression: $ => seq('(', $._expression, ')'),

		// --------------- Block expression ---------------

		block: $ => seq(
			'{',
			repeat(seq($._statement, optional($._statement_terminator))),
			optional($._expression),  // trailing expression (block value)
			'}',
		),

		// --------------- Operators ---------------

		unary_expression: $ => prec(PREC.UNARY, choice(
			seq('-', field('operand', $._expression)),
			seq('!', field('operand', $._expression)),
		)),

		binary_expression: $ => choice(
			prec.left(PREC.OR, seq($._expression, '||', $._expression)),
			prec.left(PREC.AND, seq($._expression, '&&', $._expression)),
			prec.left(PREC.BIT_OR, seq($._expression, '|', $._expression)),
			prec.left(PREC.BIT_XOR, seq($._expression, '^', $._expression)),
			prec.left(PREC.BIT_AND, seq($._expression, '&', $._expression)),
			prec.left(PREC.EQUALITY, seq($._expression, choice('==', '!='), $._expression)),
			prec.left(PREC.COMPARISON, seq($._expression, choice('<', '<=', '>', '>='), $._expression)),
			prec.left(PREC.SHIFT, seq($._expression, choice('<<', '>>'), $._expression)),
			prec.left(PREC.ADDITIVE, seq($._expression, choice('+', '-'), $._expression)),
			prec.left(PREC.MULTIPLICATIVE, seq($._expression, choice('*', '/', '%'), $._expression)),
		),

		range_expression: $ => prec.left(PREC.RANGE, seq(
			field('start', $._expression),
			field('operator', choice('..', '..=')),
			field('end', $._expression),
		)),

		cast_expression: $ => prec.left(PREC.CAST, seq(
			field('expression', $._expression),
			field('operator', choice('as', 'as!')),
			field('target_type', $._type),
		)),

		try_expression: $ => prec(PREC.TRY, seq(
			field('expression', $._expression),
			'?',
		)),

		// --------------- Call / member access ---------------

		call_expression: $ => prec(PREC.CALL, seq(
			field('callee', choice($.identifier, $.path_expression)),
			optional($.type_arguments),
			field('arguments', $.argument_list),
		)),

		method_call: $ => prec.left(PREC.MEMBER + 1, seq(
			field('object', $._expression),
			choice('.', '::'),
			field('method', $.identifier),
			optional($.type_arguments),
			field('arguments', $.argument_list),
		)),

		field_access: $ => prec.left(PREC.MEMBER, seq(
			field('object', $._expression),
			choice('.', '::'),
			field('field', choice($.identifier, $.integer_literal)),
		)),

		index_expression: $ => prec(PREC.CALL, seq(
			field('object', $._expression),
			'[',
			field('index', $._expression),
			']',
		)),

		slice_expression: $ => prec(PREC.CALL, seq(
			field('object', $._expression),
			'[',
			optional(field('start', $._expression)),
			'..',
			optional(field('end', $._expression)),
			']',
		)),

		argument_list: $ => seq(
			'(',
			optional(seq(
				commaSep1($._expression),
				optional(','),
			)),
			')',
		),

		// --------------- Path expression (e.g. Color::Red) ---------------

		path_expression: $ => prec.left(seq(
			$.identifier,
			'::',
			$.identifier,
			optional(choice(
				// Tuple construction: Color::Circle(5.0)
				$.argument_list,
				// Struct construction: Color::Triangle { a: 1.0 }
				seq('{', optional(commaSep1($.struct_field_value)), optional(','), '}'),
			)),
		)),

		// --------------- Closure ---------------

		closure: $ => prec.right(seq(
			'(',
			optional(commaSep1($.closure_parameter)),
			optional(','),
			')',
			'=>',
			field('body', choice($.block, $._expression)),
		)),

		closure_parameter: $ => seq(
			field('name', $.identifier),
			optional(seq(':', field('type', $._type))),
		),

		// --------------- If expression ---------------

		if_expression: $ => prec.right(seq(
			'if',
			field('condition', $._expression),
			field('consequence', $.block),
			optional(seq(
				'else',
				field('alternative', choice($.block, $.if_expression)),
			)),
		)),

		// --------------- Match expression ---------------

		match_expression: $ => seq(
			'match',
			field('subject', $._expression),
			'{',
			repeat($.match_arm),
			'}',
		),

		match_arm: $ => seq(
			field('pattern', $._pattern),
			optional(seq('if', field('guard', $._expression))),
			'=>',
			field('body', choice($.block, $._expression)),
			optional(','),
		),

		// --------------- Patterns ---------------

		_pattern: $ => choice(
			$.wildcard_pattern,
			$.literal_pattern,
			$.binding_pattern,
			$.enum_variant_pattern,
			$.struct_pattern,
			$.or_pattern,
			$.range_pattern,
			$.at_binding_pattern,
			$.slice_pattern,
		),

		wildcard_pattern: $ => '_',

		literal_pattern: $ => choice(
			$.integer_literal,
			$.float_literal,
			$.string_literal,
			$.bool_literal,
			seq('-', choice($.integer_literal, $.float_literal)),
		),

		binding_pattern: $ => $.identifier,

		enum_variant_pattern: $ => seq(
			optional(field('enum_name', $.identifier)),
			'::',
			field('variant_name', $.identifier),
			optional(choice(
				// Tuple payload
				seq('(', optional(commaSep1($._pattern)), optional(','), ')'),
				// Struct payload
				seq('{', optional(commaSep1($.struct_pattern_field)), optional(','), '}'),
			)),
		),

		struct_pattern: $ => seq(
			field('type_name', $.identifier),
			'{',
			commaSep1($.struct_pattern_field),
			optional(','),
			'}',
		),

		struct_pattern_field: $ => seq(
			field('field', $.identifier),
			optional(seq(':', field('binding', $.identifier))),
		),

		or_pattern: $ => prec.left(seq(
			$._pattern,
			'|',
			$._pattern,
		)),

		range_pattern: $ => seq(
			optional(choice(
				$.integer_literal,
				$.float_literal,
				seq('-', choice($.integer_literal, $.float_literal)),
			)),
			choice('..', '..='),
			optional(choice(
				$.integer_literal,
				$.float_literal,
				seq('-', choice($.integer_literal, $.float_literal)),
			)),
		),

		at_binding_pattern: $ => seq(
			field('name', $.identifier),
			'@',
			field('pattern', $._pattern),
		),

		slice_pattern: $ => seq(
			'[',
			commaSep(choice(
				$._pattern,
				$.rest_pattern,
			)),
			optional(','),
			']',
		),

		// --------------- Spawn expression ---------------

		spawn_expression: $ => seq(
			'spawn',
			'(',
			optional(commaSep1($.spawn_parameter)),
			optional(','),
			')',
			'=>',
			field('body', $.block),
		),

		spawn_parameter: $ => seq(
			optional('move'),
			field('name', $.identifier),
		),

		// --------------- Select expression ---------------

		select_expression: $ => seq(
			'select',
			'{',
			repeat($.select_arm),
			optional($.select_default_arm),
			'}',
		),

		select_arm: $ => seq(
			field('operation', $.select_operation),
			optional(seq('if', field('guard', $._expression))),
			'=>',
			field('body', choice($.block, $._expression)),
			optional(','),
		),

		select_operation: $ => choice(
			$.select_recv,
			$.select_send,
			$.select_sleep,
			$.select_wait,
		),

		select_recv: $ => seq(
			field('receiver', $._expression),
			'.', 'recv', '(', ')',
			optional(seq('as', field('binding', $.identifier))),
		),

		select_send: $ => seq(
			field('sender', $._expression),
			'.', 'send', '(', field('value', $._expression), ')',
		),

		select_sleep: $ => seq(
			'sleep', '(', field('duration', $._expression), ')',
		),

		select_wait: $ => seq(
			field('handle', $._expression),
			'.', 'wait', '(', ')',
			optional(seq('as', field('binding', $.identifier))),
		),

		select_default_arm: $ => seq(
			'_',
			'=>',
			field('body', choice($.block, $._expression)),
			optional(','),
		),

		// --------------- Types ---------------

		_type: $ => choice(
			$.primitive_type,
			$.type_identifier,
			$.array_type,
			$.tuple_type,
			$.function_type,
			$.generic_type,
			$.associated_type,
			$.option_type,
			$.result_type,
		),

		primitive_type: $ => choice(...PRIMITIVE_TYPES),

		type_identifier: $ => $.identifier,

		array_type: $ => prec(1, seq($._type, '[', ']')),

		tuple_type: $ => seq('(', commaSep($._type), ')'),

		function_type: $ => seq('fn', '(', commaSep($._type), ')', '->', $._type),

		generic_type: $ => prec(1, seq(
			field('name', $.identifier),
			$.type_arguments,
		)),

		associated_type: $ => seq(
			field('base', $._type),
			'.',
			field('name', $.identifier),
		),

		// Postfix `T?` sugar for `Option<T>`
		option_type: $ => prec.left(1, seq($._type, '?')),

		// Postfix `T!E` sugar for `Result<T, E>`
		result_type: $ => prec.left(1, seq($._type, '!', $._type)),

		type_parameters: $ => seq(
			'<',
			commaSep1($.type_parameter),
			'>',
		),

		type_parameter: $ => seq(
			field('name', $.identifier),
			optional($.type_bounds),
		),

		type_bounds: $ => seq(
			':',
			$.trait_bound,
			repeat(seq('+', $.trait_bound)),
		),

		trait_bound: $ => seq(
			field('trait_name', $.identifier),
			optional($.type_arguments),
		),

		type_arguments: $ => seq(
			'<',
			commaSep1($._type),
			'>',
		),

		// --------------- Attributes ---------------

		attribute: $ => seq(
			'#[',
			field('name', $.identifier),
			optional(seq(
				'(',
				commaSep1($.attribute_argument),
				')',
			)),
			']',
		),

		attribute_argument: $ => choice(
			// Key-value: rename = "field"
			seq(field('key', $.identifier), '=', field('value', $.string_literal)),
			// Flag: untagged
			field('flag', $.identifier),
		),

		// --------------- Comments ---------------

		line_comment: $ => token(seq('//', /.*/)),

		block_comment: $ => token(seq(
			'/*',
			/[^*]*\*+([^/*][^*]*\*+)*/,
			'/',
		)),

		// --------------- Identifiers ---------------

		identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,
	},
});

// Helper: comma-separated with at least one element
function commaSep1(rule) {
	return seq(rule, repeat(seq(',', rule)));
}

// Helper: comma-separated with zero or more elements
function commaSep(rule) {
	return optional(commaSep1(rule));
}

// Helper: comma or newline separated (for struct fields, enum variants)
function commaSepNl(rule) {
	return seq(rule, repeat(seq(optional(','), rule)));
}
