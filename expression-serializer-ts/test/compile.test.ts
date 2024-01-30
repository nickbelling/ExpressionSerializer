import {
    ScriptKind,
    ScriptTarget,
    createPrinter,
    createProgram,
    createSourceFile,
    transform,
} from "typescript";
import { serializeExpressionTransformer } from "./../build-tools/transformer";

describe("Test transformer", () => {
    function compile(source: string): string {
        const sourceFile = createSourceFile(
            "test.ts",
            source,
            ScriptTarget.Latest,
            true,
            ScriptKind.TS
            );

        const result = transform(sourceFile, [
            serializeExpressionTransformer(createProgram(["test.ts"], {})),
        ]);

        const printer = createPrinter();
        return printer.printFile(result.transformed[0]);
    }

    it("should handle binary comparisons", () => {
        const source = `
            import { serializeExpression } from './serialize';
            const result = serializeExpression(x => x.age > 10);
        `;
        const output = compile(source);
        expect(output).toContain("const result = `age gt 10`");
    });

    it("should handle variables", () => {
        const source = `
            import { serializeExpression } from './serialize';
            const num: number = 30;
            const result = serializeExpression(x => x.age > num);`;
        const output = compile(source);

        console.log('Transformed output:\n', output);
        expect(output).toContain("const result = `age gt ${num}`");
    });

    it("should handle function calls", () => {
        const source = `
            import { serializeExpression } from './serialize';
            function someFunction(num: number): number {
                return num;
            }
            const num: number = 50;
            const result = serializeExpression(x => x.age <= someFunction(num));`;
        const output = compile(source);

        expect(output).toContain("const result = `age le ${someFunction(num)}`");
    });

    it('should handle collections', () => {
        const source = `
            import { serializeExpression } from './serialize';
            function someFunction(num: number): number {
                return num;
            }
            const num: number = 50;
            const result = serializeExpression(x => 
                x.items.some(i => i.currentPrice <= someFunction(num)));`;
        const output = compile(source);

        expect(output).toContain("const result = `items/any(i: i/currentPrice le ${someFunction(num)})`");
    });

    it('should handle type information in the arrow function', () => {
        const source = `
            import { serializeExpression } from './serialize';
            interface Person {
                name: string;
                age: number;
            }

            const result = serializeExpression<Person>((x: Person) => x.age > 10);
        `;

        const output = compile(source);
        expect(output).toContain("const result = `age gt 10`");
    });

    it('should handle different formatting styles in the arrow function', () => {
        const source = `
            import { serializeExpression } from './serialize';
            interface Person {
                name: string;
                age: number;
            }

            const result = serializeExpression<Person>((x) => {
                return x.age > 10
            });
        `;

        const output = compile(source);
        expect(output).toContain("const result = `age gt 10`");
    });

    it('should handle function aliasing', () => {
        const source = `
            import { serializeExpression as se } from './serialize';
            const result = se(x => x.age > 10);
        `;
        const output = compile(source);
        expect(output).toContain("const result = `age gt 10`");
    });

    it('should handle module aliasing', () => {
        const source = `
            import * as se from './serialize';
            const result = se.serializeExpression(x => x.age > 10);
        `;
        const output = compile(source);
        expect(output).toContain("const result = `age gt 10`");
    });
});
