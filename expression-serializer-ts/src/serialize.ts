/**
 * Serializes a lambda expression of type {@link TEntity} into an OData `$filter` string.
 * @typedef TEntity The entity type matching the expression.
 * @param expression The expression to be serialized into an OData $filter string.
 * 
 * @example
 * // The TypeScript:
 * const serialized: string = serialize<Person>(p => p.Name.startsWith('A') && p.Age >= 18);
 * 
 * // Compiles to the following OData $filter string:
 * const serialized = `startswith(Name, 'A') and Age ge 30`;
 */
export function serializeExpression<TEntity>(expression: (x: TEntity) => boolean): string {
    throw new Error(`This function is intended to be replaced during compile-time, and should not exist at runtime.
        If you encounter this error during runtime, it means you have not correctly set up the TypeScript transformer
        included with 'expression-serializer-ts'. See that project's README for details of how to implement it.
    `);
}
