import { convertFuncToODataString } from '../src/serializer';
import { Person, Customer } from './model';

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

    it('should handle indexof', () => {
        checkResult<Person>(x => x.name.indexOf('B') == 0, "indexof(name, 'B') eq 0");
    });

    it('should handle functions on nested properties', () => {
        checkResult<Customer>(x => x.person.name.startsWith('A'), "startswith(person/name, 'A')");
    });

    it('should handle toLower and toUpper', () => {
        checkResult<Person>(x => x.name.toLowerCase() == 'bob', "tolower(name) eq 'bob'");
        checkResult<Person>(x => x.name.toLocaleLowerCase() == 'bob', "tolower(name) eq 'bob'");
        checkResult<Person>(x => x.name.toUpperCase() == 'bob', "toupper(name) eq 'bob'");
        checkResult<Person>(x => x.name.toLocaleUpperCase() == 'bob', "toupper(name) eq 'bob'");
    });

    it('should handle variable values', () => {
        const num: number = 123;
        checkResult<Person>(x => x.age == num, "age eq \" + num + \"");
    });
});
