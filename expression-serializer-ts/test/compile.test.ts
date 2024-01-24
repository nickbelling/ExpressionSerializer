import {
    ScriptKind,
    ScriptTarget,
    createPrinter,
    createProgram,
    createSourceFile,
    transform,
} from "typescript";
import { serializeTransformer } from "../src/transformer";
import { Person } from "./model";

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
            serializeTransformer(createProgram(["test.ts"], {})),
        ]);

        const printer = createPrinter();
        return printer.printFile(result.transformed[0]);
    }

    function checkOData<T>(
        expression: (x: T) => boolean,
        expectedOData: string
    ): void {
        const source = `
            import { serializeExpression } from './serialize';
            const result = serializeExpression(${expression.toString()});`;
        const output = compile(source);

        expect(output).toContain(`const result = \`${expectedOData}\``);
    }

    it("should handle binary comparisons", () => {
        checkOData<Person>((x) => x.age > 10, "age gt 10");
    });

    it("should handle variables", () => {
        const source = `
            import { serializeExpression } from './serialize';
            const num: number = 30;
            const result = serializeExpression(x => x.age > num);`;
        const output = compile(source);

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
});
