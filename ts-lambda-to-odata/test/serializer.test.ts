import { convertFuncToODataString } from './../build-tools/serializer';
import { Person, Customer, Item, Order } from './model';

function checkResult<T>(
    func: (x: T) => boolean,
    result: string
) {
    const filter = convertFuncToODataString<T>(func);
    expect(filter).toEqual(result);
}

describe('Expression Serializer', () => {
    it('should handle greater than numbers', () => {
        checkResult<Person>(x => x.age > 15, 'age gt 15');
    });

    it('should handle less than numbers', () => {
        checkResult<Person>(x => x.age < 18, 'age lt 18');
    });

    it('should handle equal to numbers', () => {
        checkResult<Person>(x => x.age == 30, 'age eq 30');
    });

    it('should handle not equal to numbers', () => {
        checkResult<Person>(x => x.age != 0, 'age ne 0');
    });

    it('should handle equal to strings', () => {
        checkResult<Person>(x => x.name === 'Bob', "name eq 'Bob'");
    });

    it('should handle not equal to strings', () => {
        checkResult<Person>(x => x.name !== 'Bob', "name ne 'Bob'");
    });

    it('should handle null strings', () => {
        checkResult<Person>(x => x.name == null, 'name eq null');
        checkResult<Person>(x => x.name === null, 'name eq null');
    });
    
    it('should treat undefined as null', () => {
        checkResult<Person>(x => x.name == undefined, 'name eq null');
        checkResult<Person>(x => x.name === undefined, 'name eq null');
    });

    it('should handle string startsWith', () => {
        checkResult<Person>(x => x.name.startsWith('B'), "startswith(name, 'B')");
    });

    it('should handle string endsWith', () => {
        checkResult<Person>(x => x.name.endsWith('B'), "endswith(name, 'B')");
    });

    it('should handle string contains', () => {
        checkResult<Person>(x => x.name.includes('ob'), "contains(name, 'ob')");
    });

    it('should handle substrings', () => {
        checkResult<Person>(x => x.name.substring(2) == "Bo", "substring(name, 2) eq 'Bo'");
    });

    it('should handle string indexof', () => {
        checkResult<Person>(x => x.name.indexOf('B') == 0, "indexof(name, 'B') eq 0");
    });

    it('should handle string length', () => {
        checkResult<Person>(x => x.name.length == 3, "length(name) eq 3");
    });

    it('should handle explicit booleans', () => {
        checkResult<Customer>(c => c.isActive == true, "isActive eq true");
    });

    it('should handle implicit booleans', () => {
        checkResult<Customer>(c => c.isActive, "isActive");
    });

    it('should handle negative booleans', () => {
        checkResult<Customer>(c => !c.isActive, "not isActive");
    });

    it('should handle grouping', () => {
        checkResult<Customer>(c => c.person.age >= 18 || (c.isActive && c.person.age >= 16), 
        "person/age ge 18 or (isActive and person/age ge 16)");
    });

    it('should handle arithmetic', () => {
        checkResult<Person>(x => (x.age + 2 * x.age - 5) > 5, "(age add 2 mul age sub 5) gt 5");
    });

    it('should handle nested properties', () => {
        checkResult<Customer>(x => x.person.age >= 18, "person/age ge 18");
    });

    it('should handle functions on nested properties', () => {
        checkResult<Customer>(x => x.person.name.startsWith('A'), "startswith(person/name, 'A')");
    });

    it('should handle toLower and toUpper', () => {
        checkResult<Person>(x => x.name.toLowerCase() == 'bob', "tolower(name) eq 'bob'");
        checkResult<Person>(x => x.name.toLocaleLowerCase() == 'bob', "tolower(name) eq 'bob'");
    });

    it('should handle toUpper', () => {
        checkResult<Person>(x => x.name.toUpperCase() == 'bob', "toupper(name) eq 'bob'");
        checkResult<Person>(x => x.name.toLocaleUpperCase() == 'bob', "toupper(name) eq 'bob'");
    });

    it('should handle variable values', () => {
        const num: number = 123;
        checkResult<Person>(x => x.age == num, "age eq ${num}");
    });

    it('should handle function calls', () => {
        const num: number = 456;
        function someFunction(num: number): number {
            return num;
        }

        checkResult<Person>(x => x.age <= someFunction(num), "age le ${someFunction(num)}");
    });

    it('should handle array contains', () => {
        checkResult<Item>(x => x.historicPrices.includes(123), "contains(historicPrices, 123)");
    });

    it('should handle array length', () => {
        checkResult<Item>(x => x.historicPrices.length > 5, "length(historicPrices) gt 5");
    });

    it('should handle array indexof', () => {
        checkResult<Item>(x => x.historicPrices.indexOf(2) > 0, "indexof(historicPrices, 2) gt 0");
    });

    it('should handle "any" collections', () => {
        checkResult<Order>(x => x.items.some(i => i.currentPrice < 10), "items/any(i: i/currentPrice lt 10)");
    });

    it('should handle "all" collections', () => {
        checkResult<Order>(x => x.items.every(i => i.currentPrice < 10), "items/all(i: i/currentPrice lt 10)");
    });

    it('should handle "none" collections', () => {
        checkResult<Order>(x => !x.items.some(i => i.currentPrice > 10), "not items/any(i: i/currentPrice gt 10)");
    });

    it('should handle "any" expressions with function calls', () => {
        checkResult<Customer>(x => x.orders.some(o => o.items.length > 1), "orders/any(o: length(o/items) gt 1)");
    });
});
