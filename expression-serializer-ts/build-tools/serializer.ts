import {
    ArrowFunction, CallExpression, CompilerHost, createProgram, createSourceFile, forEachChild,
    Identifier, isArrowFunction, isFunctionExpression, Node, NumericLiteral,
    ParenthesizedExpression, PrefixUnaryExpression, PropertyAccessExpression, ScriptTarget,
    StringLiteral, SyntaxKind, TypeChecker
} from 'typescript';

interface ParsedExpression {
    expression: ArrowFunction | null;
    typeChecker: TypeChecker
}

export function convertFuncToODataString<T>(func: (x: T) => boolean): string {
    const parsed: ParsedExpression = parseFunctionToArrowFunctionExpression(func);
    if (parsed.expression) {
        return convertExpressionToODataString(parsed.expression, parsed.typeChecker);
    } else {
        throw new Error(`Could not parse input "${func.toString()}" as an Expression.`);
    }
}

export function convertExpressionToODataString(
    expression: ArrowFunction,
    typeChecker: TypeChecker): string {

    let odataFilter: string = "";
    let lambdaParameter: string | undefined = undefined;

    if (expression.kind === SyntaxKind.ArrowFunction) {
        const arrowFunction = expression as ArrowFunction;
        if (arrowFunction.parameters.length > 0) {
            lambdaParameter = arrowFunction.parameters[0].name.getText();
        }
    }

    const visitNode = (
        node: Node,
        parentNode?: Node,
        includeIdentifier: boolean = false) => {

        let processed = false;

        if (binaryOperatorKinds.includes(node.kind)) {
            // >, <, >=, <=, ==, etc
            odataFilter += ` ${processBinaryOperator(node)} `;
            processed = true;
        } else if (arithmeticOperatorKinds.includes(node.kind)) {
            // +, -, /, *, %, etc
            odataFilter += ` ${processArithmeticOperator(node)} `;
            processed = true;
        } else if (literalOperatorKinds.includes(node.kind)) {
            // "string", 123, true, false, undefined, null, etc
            odataFilter += processLiteralOperator(node);
            processed = true;
        } else if (node.kind === SyntaxKind.PrefixUnaryExpression) {
            // ![expression]
            const prefixUnaryExpression = node as PrefixUnaryExpression;
            if (prefixUnaryExpression.operator === SyntaxKind.ExclamationToken) {
                // Save the current state of odataFilter
                const saveOdataFilter = odataFilter;
                odataFilter = '';

                // Process the operand of the unary expression
                visitNode(prefixUnaryExpression.operand, node, includeIdentifier);

                const operandFilter = odataFilter;
                odataFilter = `not ${operandFilter}`;

                // Restore the original state
                odataFilter = saveOdataFilter + odataFilter;
                processed = true;
            }
        } else if (node.kind === SyntaxKind.ParenthesizedExpression) {
            // groupings
            const parenthesizedExpression = node as ParenthesizedExpression;
            odataFilter += "(";

            // Process the expression inside the parentheses
            visitNode(parenthesizedExpression.expression, node, includeIdentifier);

            odataFilter += ")";
            processed = true;
        } else if (node.kind === SyntaxKind.PropertyAccessExpression) {
            // Property access
            const propertyAccess = node as PropertyAccessExpression;
            const object = propertyAccess.expression;
            const property = propertyAccess.name;

            if (property.text === 'length') {
                // Special handling for 'length' property on a string/array, which in OData becomes a "length()"
                // function call
                const objectText = getNestedPropertyName(object, lambdaParameter, includeIdentifier);
                odataFilter += `length(${objectText})`;
            } else {
                // Handling for other property access expressions
                if (object.kind === SyntaxKind.Identifier && (object as Identifier).text === lambdaParameter) {
                    if (includeIdentifier) {
                        odataFilter += `${lambdaParameter}/${property.text}`;
                    } else {
                        odataFilter += property.text;
                    }
                } else {
                    // Use getNestedPropertyName for nested properties to format correctly
                    const fullPropertyName = getNestedPropertyName(propertyAccess, lambdaParameter, includeIdentifier);
                    odataFilter += fullPropertyName;
                }
            }
            processed = true;
        } else if (node.kind === SyntaxKind.Identifier) {
            // Identifier/variable/property
            if (nodeIsPartOfExpression(node, expression)) {
                odataFilter += processIdentifier(node, typeChecker, lambdaParameter, parentNode);
            }
        } else if (node.kind === SyntaxKind.CallExpression) {
            // Function calls
            const callExpression = node as CallExpression;
            const methodName = callExpression.expression.getLastToken()?.getText();
            const args = callExpression.arguments.map(arg => arg.getText()).join(', '); // Get the arguments

            if (collectionFunctionNames.includes(methodName!)) {
                const propertyAccess = callExpression.expression as PropertyAccessExpression;
                const collectionName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);
                const lambdaExpression = callExpression.arguments[0];

                // Assuming the lambda expression is an arrow function
                if (isArrowFunction(lambdaExpression) || isFunctionExpression(lambdaExpression)) {
                    // Capture the current lambda parameter and set it to the new one
                    const originalLambdaParameter = lambdaParameter;
                    lambdaParameter = lambdaExpression.parameters[0].name.getText();

                    // Save the current state of odataFilter and reset it for building the lambda body
                    const saveOdataFilter = odataFilter;
                    odataFilter = '';

                    // Process the lambda body
                    forEachChild(lambdaExpression.body, node => visitNode(node, undefined, true));

                    // Build the OData filter string for the 'any' expression
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
                // This is a direct function call to something 
                const expression = callExpression.expression.getText();
                odataFilter += `\${${expression}(${args})}`;
                processed = true; // Set the flag to true to avoid further processing
            }
        }

        if (!processed) {
            // Continue processing further children of this node
            forEachChild(node, (child) => visitNode(child, node, includeIdentifier));
        } // else we've converted this node into its equivalent
    };

    forEachChild(expression, visitNode);

    return odataFilter;
}

function parseFunctionToArrowFunctionExpression<T>(fn: (x: T) => boolean): ParsedExpression {
    const functionString = fn.toString();
    const sourceFile = createSourceFile(
        'tempFile.ts',
        functionString,
        ScriptTarget.Latest,
        true /* setParentNodes */
    );

    const host: CompilerHost = {
        getSourceFile: (fileName) => fileName === 'tempFile.ts' ? sourceFile : undefined,
        getDefaultLibFileName: () => 'lib.d.ts',
        writeFile: () => { },
        getCurrentDirectory: () => '/',
        getDirectories: () => [],
        getCanonicalFileName: fileName => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: fileName => fileName === 'tempFile.ts',
        readFile: () => '',
        directoryExists: () => true,
        getEnvironmentVariable: () => ''
    };

    const program = createProgram(
        ['tempFile.ts'],
        {
            noResolve: true,
            target: ScriptTarget.Latest
        }, host);
    const typeChecker = program.getTypeChecker();

    // Traverse the AST to find the ArrowFunction
    let arrowFunctionNode: ArrowFunction | null = null;
    function visit(node: Node) {
        if (isArrowFunction(node)) {
            arrowFunctionNode = node as ArrowFunction;
        } else {
            forEachChild(node, visit);
        }
    }
    forEachChild(sourceFile, visit);

    return {
        expression: arrowFunctionNode,
        typeChecker: typeChecker
    };
}

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

const arithmeticOperatorKinds: SyntaxKind[] = [
    SyntaxKind.PlusToken,
    SyntaxKind.MinusToken,
    SyntaxKind.AsteriskToken,
    SyntaxKind.SlashToken,
    SyntaxKind.PercentToken
];

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

const literalOperatorKinds: SyntaxKind[] = [
    SyntaxKind.StringLiteral,
    SyntaxKind.NumericLiteral,
    SyntaxKind.TrueKeyword,
    SyntaxKind.FalseKeyword,
    SyntaxKind.NullKeyword,
    SyntaxKind.UndefinedKeyword
];

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
 * Handles an identifier (i.e. a reference to a variable), in which case we'll make it an interpolated string parameter.
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

const methodCallNames: string[] = [
    'startsWith',
    'endsWith',
    'includes',
    'indexOf',
    'substring',
    'toLowerCase',
    'toLocaleLowerCase',
    'toUpperCase',
    'toLocaleUpperCase',
    'trim'
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
            return `contains(${propertyName}, ${args})`;
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

const collectionFunctionNames: string[] = [
    'some',
    'every'
];

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
