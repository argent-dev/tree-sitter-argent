; Scopes
(function_declaration body: (block) @local.scope)
(impl_method body: (block) @local.scope)
(trait_method body: (block) @local.scope)
(closure body: (block) @local.scope)
(block) @local.scope
(for_in_statement body: (block) @local.scope)
(while_statement body: (block) @local.scope)
(loop_statement body: (block) @local.scope)
(if_expression consequence: (block) @local.scope)
(if_expression alternative: (block) @local.scope)

; Definitions
(let_declaration name: (identifier) @local.definition)
(const_declaration name: (identifier) @local.definition)
(typed_parameter name: (identifier) @local.definition)
(closure_parameter name: (identifier) @local.definition)
(for_in_statement binding: (identifier) @local.definition)
(function_declaration name: (identifier) @local.definition)

; References
(identifier) @local.reference
