import { serialize } from "./../src/serialize";
import { Person } from "./model";

describe('Test serialize function', () => {
    test('throws error at runtime', () => {
        expect(
            () => serialize<Person>(x => x.name == "Bob" && x.age > 20)
        ).toThrow();
    });
});
