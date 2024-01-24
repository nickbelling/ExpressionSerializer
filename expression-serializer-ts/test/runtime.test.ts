import { serializeExpression } from "./../src/serialize";
import { Person } from "./model";

describe('Test serialize function', () => {
    test('throws error at runtime', () => {
        expect(
            () => serializeExpression<Person>(x => x.name == "Bob" && x.age > 20)
        ).toThrow();
    });
});
