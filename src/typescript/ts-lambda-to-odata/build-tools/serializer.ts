import {
    ArrowFunction, CallExpression, CompilerHost, createProgram, createSourceFile, forEachChild,
    Identifier, isArrowFunction, isFunctionExpression, LeftHandSideExpression, MemberName, Node, NumericLiteral,
    ParenthesizedExpression, PrefixUnaryExpression, PropertyAccessExpression, ScriptTarget,
    StringLiteral, SyntaxKind, TypeChecker
} from 'typescript';

interface ParsedExpression {
    expression: ArrowFunction | null;
    typeChecker: TypeChecker
}

/**
 * Parses the TypeScript Abstract Syntax Tree for an {@link ArrowFunction} that accepts an object and returns a boolean
 * (i.e. a lambda of `(T) => boolean`), and creates an OData `$filter` string.
 * @param expression The lambda expression being converted to an OData string.
 * @param typeChecker The TypeScript {@link Program}'s {@link TypeChecker}.
 * @returns An OData `$filter` string representation of the provided lambda function.
 */
export function convertExpressionToODataString(
    expression: ArrowFunction,
    typeChecker: TypeChecker): string {

    let odataFilter: string = "";
    let lambdaParameter: string | undefined = undefined;

    // Get the lambda parameter (e.g. the "x" part of `(x: MyObject) => x.Something == "Blah";`). We need this to
    // determine which identifiers represent the object being passed into the function (as those aren't part of an OData
    // string), as opposed to properties on that object (which WILL appear in the OData string) or external variables
    // (which we will interpolate into the string at runtime).
    if (expression.kind === SyntaxKind.ArrowFunction) {
        const arrowFunction = expression as ArrowFunction;
        if (arrowFunction.parameters.length > 0) {
            lambdaParameter = arrowFunction.parameters[0].name.getText();
        }
    }

    // Build the Visitor function. This traverses the AST for the expression and builds up the OData string.
    const visitNode = (
        node: Node,
        parentNode?: Node,
        includeIdentifier: boolean = false) => {

        // Some nodes get converted into the string, others need to be visited themselves.
        let processed = false;

        // Check the type of node we're currently looking at:
        if (binaryOperatorKinds.includes(node.kind)) {
            // Binary operator (e.g. >, <, >=, <=, ==, etc)
            odataFilter += ` ${processBinaryOperator(node)} `;
            processed = true;
        } else if (arithmeticOperatorKinds.includes(node.kind)) {
            // Arithmetic operator (e.g. +, -, /, *, %, etc)
            odataFilter += ` ${processArithmeticOperator(node)} `;
            processed = true;
        } else if (literalOperatorKinds.includes(node.kind)) {
            // In-code literal such as "string", 123, true, false, undefined, null, etc
            odataFilter += processLiteralOperator(node);
            processed = true;
        } else if (node.kind === SyntaxKind.PrefixUnaryExpression) {
            // "Not something" expression (e.g. ![expression])
            const prefixUnaryExpression = node as PrefixUnaryExpression;
            if (prefixUnaryExpression.operator === SyntaxKind.ExclamationToken) {
                // Save the current state of odataFilter
                const oldOdataFilter = odataFilter;
                odataFilter = '';

                // Process the operand of the unary expression
                visitNode(prefixUnaryExpression.operand, node, includeIdentifier);

                const operandFilter = odataFilter;
                odataFilter = `not ${operandFilter}`;

                // Restore the original state
                odataFilter = oldOdataFilter + odataFilter;
                processed = true;
            }
        } else if (node.kind === SyntaxKind.ParenthesizedExpression) {
            // Parentheses
            const parenthesizedExpression = node as ParenthesizedExpression;
            odataFilter += "(";

            // Process the expression inside the parentheses
            visitNode(parenthesizedExpression.expression, node, includeIdentifier);

            odataFilter += ")";
            processed = true;
        } else if (node.kind === SyntaxKind.PropertyAccessExpression) {
            // Property access
            const propertyAccess = node as PropertyAccessExpression;
            const object: LeftHandSideExpression = propertyAccess.expression;
            const property: MemberName = propertyAccess.name;

            if (property.text === 'length') {
                // Special handling for 'length' property on a string/array, which in OData becomes a "length(property)"
                // function call for a string, and "property/$count" for an array
                const objectText = getNestedPropertyName(object, lambdaParameter, includeIdentifier);

                const objectType = typeChecker.getTypeAtLocation(object);
                const objectSymbol = objectType.getSymbol();
                const typeAsString = typeChecker.typeToString(objectType);
        
                // Initialize isString as false
                let isString: boolean = false;
        
                // Check if the object type is a string
                if (typeAsString === 'string') {
                    isString = true;
                } else {
                    // Check for array types, considering both explicit arrays and ReadonlyArray<T>
                    const isArray = objectType.getNumberIndexType() !== undefined ||
                                     typeChecker.isArrayType(objectType) ||
                                     typeChecker.isTupleType(objectType) ||
                                     (objectSymbol && typeChecker.getFullyQualifiedName(objectSymbol) === 'Array');
        
                    isString = !isArray; // If it's not an array, we assume it's a string for simplicity
                }
                
                if (isString) {
                    odataFilter += `length(${objectText})`;
                } else {
                    odataFilter += `${objectText}/$count`;
                }
            } else {
                // Handling for other property access expressions
                if (object.kind === SyntaxKind.Identifier && (object as Identifier).text === lambdaParameter) {
                    // Accessing a flat property on the object of interest
                    if (includeIdentifier) {
                        // Including the identifier (e.g. inside an "any(item: item/price gt 20)" sub-expression)
                        odataFilter += `${lambdaParameter}/${property.text}`;
                    } else {
                        // Most likely scenario, just print the property name we're interested in
                        odataFilter += property.text;
                    }
                } else {
                    // Accessing a nested property on the object of interest, format it properly before printing
                    const fullPropertyName = getNestedPropertyName(propertyAccess, lambdaParameter, includeIdentifier);
                    odataFilter += fullPropertyName;
                }
            }
            processed = true;
        } else if (node.kind === SyntaxKind.Identifier) {
            // Node is an Identifier/variable/property
            if (nodeIsPartOfExpression(node, expression)) {
                odataFilter += processIdentifier(node, typeChecker, lambdaParameter, parentNode);
            }
            // else likely typing information on the actual parameter part of the lambda (e.g. the "MyType" in
            // "(x: MyType) => x.Blah == 123". We don't want to include anything that's not INSIDE the expression, so
            // skip.
        } else if (node.kind === SyntaxKind.CallExpression) {
            // Function calls. We support some of these, like .startsWith, toLower, .every, etc.
            const callExpression = node as CallExpression;
            const methodName = callExpression.expression.getLastToken()?.getText();
            const args = callExpression.arguments.map(arg => arg.getText()).join(', '); // Get the arguments

            if (collectionFunctionNames.includes(methodName!)) {
                // This is a collection expression (e.g. "items.every(x => x.age > 5)" or "items.some(i => i == 1)".
                // OData actually supports some of these.
                const propertyAccess = callExpression.expression as PropertyAccessExpression;
                const collectionName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);
                const internalLambdaExpression = callExpression.arguments[0];

                // Assuming the lambda expression is an arrow function
                if (isArrowFunction(internalLambdaExpression) || isFunctionExpression(internalLambdaExpression)) {
                    // Capture the current lambda parameter and set it to the new one
                    const originalLambdaParameter = lambdaParameter;
                    lambdaParameter = internalLambdaExpression.parameters[0].name.getText();

                    // Save the current state of odataFilter and reset it for building the lambda body
                    const saveOdataFilter = odataFilter;
                    odataFilter = '';

                    // Process the lambda body
                    forEachChild(internalLambdaExpression.body, node => visitNode(node, undefined, true));

                    // Build the OData filter string to represent the collection expression
                    const lambdaBody = odataFilter;
                    odataFilter = `${collectionName}/${getCollectionFunction(methodName)}(${lambdaParameter}: ${lambdaBody})`;

                    // Restore the original state
                    odataFilter = saveOdataFilter + odataFilter;
                    lambdaParameter = originalLambdaParameter;

                    processed = true;
                }
            } else if (callExpression.expression.kind == SyntaxKind.PropertyAccessExpression) {
                // Calling a method like "toUpper" or "includes" on a string/array
                const propertyAccess = callExpression.expression as PropertyAccessExpression;
                const propertyName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);

                if (methodName && methodCallNames.includes(methodName)) {
                    odataFilter += processMethodCall(methodName!, propertyName, args);
                    processed = true;
                }
            } else {
                // This is a direct function call to something, so we'll assume for now that it's calling something
                // external here and we want to interpolate it into the final string.
                const expression = callExpression.expression.getText();
                odataFilter += `\${${expression}(${args})}`;
                processed = true; // Set the flag to true to avoid further processing
            }
        }

        if (!processed) {
            // Continue processing further children of this node
            forEachChild(node, (child) => visitNode(child, node, includeIdentifier));
        } // else we've converted this node into its OData equivalent
    };

    forEachChild(expression, visitNode);

    return odataFilter;
}

/**
 * When a node is a {@link SyntaxKind.PropertyAccessExpression} of 1 or more levels, creates an OData string
 * representing that property access. For example, in Typescript, you'd say "Order.Customer.DateOfBirth", which in OData
 * would be "Order/Customer/DateOfBirth", or "Customer/DateOfBirth" (if "Order" is the object being inspected).
 * @param node The Property Access expression, or equivalent identifier.
 * @param lambdaParameter The lambda parameter (e.g. the "x" in "(x: MyObject) => x.IsTrue").
 * @param includeIdentifier True if the identifier (i.e. lambdaParameter) should be included in the output. Generally
 * this isn't the case, but should be if the identifier is a lambda of a collection expression such as any() or some()
 * or includes().
 * @returns The OData-compatible nested property name.
 */
function getNestedPropertyName(
    node: Node,
    lambdaParameter: string | undefined,
    includeIdentifier: boolean): string {

    if (node.kind === SyntaxKind.PropertyAccessExpression) {
        const propertyAccess = node as PropertyAccessExpression;
        const parentName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);
        return parentName ? `${parentName}/${propertyAccess.name.text}` : propertyAccess.name.text;
    } else if (node.kind === SyntaxKind.Identifier) {
        // Check if the identifier is the lambda parameter
        const identifier = node as Identifier;
        return includeIdentifier ? identifier.text : '';
    }
    return '';
}

// SyntaxKinds representing Binary operators (e.g. >, <, ==, !==, etc).
const binaryOperatorKinds: SyntaxKind[] = [
    SyntaxKind.GreaterThanToken,
    SyntaxKind.GreaterThanEqualsToken,
    SyntaxKind.LessThanToken,
    SyntaxKind.LessThanEqualsToken,
    SyntaxKind.EqualsEqualsToken,
    SyntaxKind.EqualsEqualsEqualsToken,
    SyntaxKind.ExclamationEqualsToken,
    SyntaxKind.ExclamationEqualsEqualsToken,
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.OpenParenToken,
    SyntaxKind.CloseParenToken,
    SyntaxKind.ExclamationToken
];

/** Converts a node previously determined to be a binary operator into an OData operator. */
function processBinaryOperator(node: Node): string {
    switch (node.kind) {
        // Binary comparison
        case SyntaxKind.GreaterThanToken:
            return "gt";
        case SyntaxKind.GreaterThanEqualsToken:
            return "ge";
        case SyntaxKind.LessThanToken:
            return "lt";
        case SyntaxKind.LessThanEqualsToken:
            return "le";
        case SyntaxKind.EqualsEqualsToken:
        case SyntaxKind.EqualsEqualsEqualsToken:
            return "eq";
        case SyntaxKind.ExclamationEqualsToken:
        case SyntaxKind.ExclamationEqualsEqualsToken:
            return "ne";
        case SyntaxKind.AmpersandAmpersandToken:
            return "and";
        case SyntaxKind.BarBarToken:
            return "or";
        case SyntaxKind.OpenParenToken:
            return "(";
        case SyntaxKind.CloseParenToken:
            return ")";
        case SyntaxKind.ExclamationToken:
            return "not";
        default:
            throw new Error(`Unhandled Binary Operator: ${SyntaxKind[node.kind]}.`);
    }
}

// SyntaxKinds representing Arithmetic operators (e.g. +, -, *, /, %, etc).
const arithmeticOperatorKinds: SyntaxKind[] = [
    SyntaxKind.PlusToken,
    SyntaxKind.MinusToken,
    SyntaxKind.AsteriskToken,
    SyntaxKind.SlashToken,
    SyntaxKind.PercentToken
];

/** Converts a node previously determined to be an arithmetic operator into an OData operator. */
function processArithmeticOperator(node: Node): string {
    switch (node.kind) {
        case SyntaxKind.PlusToken:
            return "add";
        case SyntaxKind.MinusToken:
            return "sub";
        case SyntaxKind.AsteriskToken:
            return "mul";
        case SyntaxKind.SlashToken:
            return "div";
        case SyntaxKind.PercentToken:
            return "mod";
        default:
            throw new Error(`Unhandled Arithmetic Operator: ${SyntaxKind[node.kind]}.`);
    }
}

// SyntaxKinds representing in-code literals (e.g. "string", 123, true, false, undefined, null)
const literalOperatorKinds: SyntaxKind[] = [
    SyntaxKind.StringLiteral,
    SyntaxKind.NumericLiteral,
    SyntaxKind.TrueKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NullKeyword,
    SyntaxKind.UndefinedKeyword
];

/** Converts a node previously determined to be a literal operator into an OData operator. */
function processLiteralOperator(node: Node) {
    switch (node.kind) {
        case SyntaxKind.StringLiteral:
            return `'${(node as StringLiteral).text}'`;
        case SyntaxKind.NumericLiteral:
            return (node as NumericLiteral).text;
        case SyntaxKind.TrueKeyword:
            return "true";
        case SyntaxKind.FalseKeyword:
            return "false";
        case SyntaxKind.NullKeyword:
        case SyntaxKind.UndefinedKeyword:
            return "null";
        default:
            throw new Error(`Unhandled Literal Operator: ${SyntaxKind[node.kind]}.`);
    }
}

/**
 * Returns true if the given node is part of the lambda expression body (and not part of the parameter/arguments).
 * @param node The node to inspect.
 * @param lambdaExpression The lambda expression the node is a part of.
 * @returns 
 */
function nodeIsPartOfExpression(node: Node, lambdaExpression: ArrowFunction): boolean {
    let currentNode: Node | undefined = node;
    while (currentNode && currentNode !== lambdaExpression) {
        if (currentNode === lambdaExpression.body) {
            return true; // Node is part of the lambda expression body
        }
        currentNode = currentNode.parent;
    }
    return false; // Node is not part of the lambda expression body
}

/**
 * Handles an external identifier (i.e. a reference to a variable outside of the lambda), in which case we'll make it an
 * interpolated string parameter.
 */
function processIdentifier(
    node: Node,
    typeChecker: TypeChecker,
    lambdaParameter?: string,
    parentNode?: Node): string {

    const identifier = node as Identifier;
    if (identifier.text === "undefined") {
        // Treat 'undefined' as 'null' in OData
        return "null";
    } else if (identifier.text !== lambdaParameter) {
        if (!parentNode || parentNode.kind !== SyntaxKind.PropertyAccessExpression) {
            const type = typeChecker.getTypeAtLocation(identifier);
            const isStringType = typeChecker.typeToString(type) === 'string';

            // Format the output based on type
            if (isStringType) {
                return `'$\{${identifier.text}\}'`;
            } else {
                return `$\{${identifier.text}\}`;
            }
        } else {
            return '';
        }
    } else {
        return '';
    }
}

// Method names which are valid to be called on certain properties
const methodCallNames: string[] = [
    // strings
    'startsWith',
    'endsWith',
    'substring',
    'toLowerCase',
    'toLocaleLowerCase',
    'toUpperCase',
    'toLocaleUpperCase',
    'trim',
    // strings and arrays
    'includes',
    'indexOf',
];

/**
 * Handles a method call on a property. Converts it to the appropriate OData syntax (e.g. "someString.startsWith('x')"
 * in TypeScript becomes "startsWith(someString, 'x')" in OData).
 * @param methodName The name of the method being called.
 * @param propertyName The name of the property this method affects (usually a string or an array).
 * @param args Arguments to the method. For the most part, the OData method args align with the TypeScript ones.
 * @returns 
 */
function processMethodCall(methodName: string, propertyName: string, args: string): string {
    switch (methodName) {
        case 'startsWith':
            return `startswith(${propertyName}, ${args})`;
        case 'endsWith':
            return `endswith(${propertyName}, ${args})`;
        case 'includes':
            return `${args} in (${propertyName})`;
        case 'indexOf':
            return `indexof(${propertyName}, ${args})`;
        case 'substring':
            return `substring(${propertyName}, ${args})`;
        case 'toLowerCase':
        case 'toLocaleLowerCase':
            return `tolower(${propertyName})`;
        case 'toUpperCase':
        case 'toLocaleUpperCase':
            return `toupper(${propertyName})`;
        case 'trim':
            return `trim(${propertyName})`;
        default:
            throw new Error(`Unhandled Function Call: ${methodName}.`);
    }
}

// Method names which represent collection lambdas such as "any/all" in OData.
const collectionFunctionNames: string[] = [
    'some',
    'every'
];

/**
 * Given a TypeScript collection function name, returns the matching OData collection function name.
 * @param functionName The collection function name.
 * @returns 
 */
function getCollectionFunction(functionName?: string): string {
    switch (functionName) {
        case 'some':
            return 'any';
        case 'every':
            return 'all';
        default:
            throw new Error('Unknown collection function name.');
    }
}
