import { ArrowFunction, CompilerHost, ModuleKind, ModuleResolutionKind, Node, Program, ScriptTarget, createCompilerHost, createProgram, createSourceFile, flattenDiagnosticMessageText, forEachChild, getPreEmitDiagnostics, isArrowFunction, isVariableStatement } from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

// A default host, used by the compiler host in "createTestProgram" to simplify resolution of library filenames.
const defaultHost = createCompilerHost({
    target: ScriptTarget.ES2022
});

/**
 * Creates a compiled test program from the provided source. References relative modules
 * based on their proximity to *this* directory.
 * @param sourceCode The source code to be compiled as the test program.
 * @returns a TypeScript {@link Program} compiled from the source.
 */
export function createTestProgram(
    sourceCode: string,
    relativeImportDirectory: string = __dirname,
    outputCompileErrors: boolean = false): Program {
    
    const sourceFile = createSourceFile(
        'testFile.ts',
        sourceCode,
        ScriptTarget.Latest,
        true /* setParentNodes */
    );

    const host: CompilerHost = {
        getSourceFile: (fileName, languageVersion, onError) => {
            if (fileName === 'testFile.ts') {
                // The dynamically created source file
                return sourceFile;
            } else if (fs.existsSync(fileName)) {
                // A full path (e.g. a library file like '/path/to/node_modules/typescript/lib.d.ts')
                const fileContents = fs.readFileSync(fileName, "utf8");
                return createSourceFile(fileName, fileContents, languageVersion, true);
            } else {
                // Most likely a relative file (e.g. import {something} from './model')
                // Attempt to read and return the file from the file system
                try {
                    const fullPath = path.join(relativeImportDirectory, fileName);
                    const fileContents = fs.readFileSync(fullPath, "utf8");
                    return createSourceFile(fileName, fileContents, languageVersion, true);
                } catch (error) {
                    if (onError) {
                        onError(`Could not read file '${fileName}': ${error}`);
                    }
                    return undefined;
                }
            }
        },
        getDefaultLibFileName: (options) => defaultHost.getDefaultLibFileName(options),
        writeFile: () => { },
        getCurrentDirectory: () => relativeImportDirectory,
        getDirectories: () => [],
        getCanonicalFileName: fileName => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: fs.existsSync,
        readFile: fileName => fs.readFileSync(fileName, 'utf8'),
        directoryExists: dirName => fs.existsSync(dirName) && fs.statSync(dirName).isDirectory()
    };

    const program = createProgram(
        ['testFile.ts'], {
            noResolve: false,
            target: ScriptTarget.ES2022,
            module: ModuleKind.NodeNext,
            moduleResolution: ModuleResolutionKind.NodeNext,
            lib: ['lib.es2022.d.ts']
        }, host);

    // Check if there are any errors
    if (outputCompileErrors) {
        outputCompileDiagnostics(program);
    }

    return program;
}

/**
 * Given a compiled TypeScript program, extracts the first found Expression that is an {@link ArrowFunction} type from
 * it.
 * @param program The compiled TypeScript program.
 * @returns The compiled ArrowFunction, or `null` if not found.
 */
export function extractExpressionFromProgram(program: Program): ArrowFunction | null {
    const sourceFile = program.getSourceFiles().find(sf => sf.fileName === 'testFile.ts');
    if (!sourceFile) return null;

    let expression: ArrowFunction | null = null;
    function findExpression(node: Node) {
        if (isVariableStatement(node)) {
            const [declaration] = node.declarationList.declarations;
            if (declaration.initializer && isArrowFunction(declaration.initializer)) {
                expression = declaration.initializer;
            }
        }
        forEachChild(node, findExpression);
    }
    forEachChild(sourceFile, findExpression);

    return expression;
}

/**
 * Given a compiled TypeScript program, console logs any compilation errors found while compiling it.
 * @param program The program to get diagnostics for.
 */
function outputCompileDiagnostics(program: Program): void {
    // Retrieve diagnostics
    const allDiagnostics = getPreEmitDiagnostics(program);

    if (allDiagnostics.length > 0) {
        console.log("Compilation errors detected:");
        allDiagnostics.forEach(diagnostic => {
            if (diagnostic.file) {
                const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
                const message = flattenDiagnosticMessageText(diagnostic.messageText, '\n');
                console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
            } else {
                console.log(`${flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
            }
        });
    } else {
        console.log("The program compiled without errors.");
    }
}
