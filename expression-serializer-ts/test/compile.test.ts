import { ScriptKind, ScriptTarget, createPrinter, createProgram, createSourceFile, transform } from "typescript";
import { serializeTransformer } from "../src/transformer";
import { Person } from "./model";

describe('Test transformer', () => {
  function compile(source: string): string {
    const sourceFile = createSourceFile(
      'test.ts',
      source,
      ScriptTarget.Latest,
      true,
      ScriptKind.TS
    );

    const result = transform(
        sourceFile,
        [
            serializeTransformer(createProgram(['test.ts'], {}))
        ]);

    const printer = createPrinter();
    return printer.printFile(result.transformed[0]);
  }

  function checkOData<T>(expression: (x: T) => boolean, expectedOData: string): void {
    const source =
        `import { serialize } from './serialize';
        const result = serialize(${expression.toString()});`;
    const output = compile(source);

    expect(output).toContain(`const result = "${expectedOData}";`);
  }

  it('should handle greater than', () => {
    checkOData<Person>(x => x.age > 10, "age gt 10");
  });

  it('should handle variables', () => {
    const source =
        `import { serialize } from './serialize';
        const num: number = 30;
        const result = serialize(x => x.age > num);`;
    const output = compile(source);

    expect(output).toContain(`const result = "age gt " + num "";`);
  });
});
