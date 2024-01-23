export function add(a: number, b: number): number {
    return a + b;
}

describe('Test add function', () => {
    test('adds two numbers', () => {
        expect(
            add(1, 2)
        ).toBe(3);
    });

    test('adds negative numbers', () => {
        expect(
            add(-1, -2)
        ).toBe(-3);
    })
});