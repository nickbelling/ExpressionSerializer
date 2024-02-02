# TypeScript Lambda Expression to OData Serializer

Converts a TypeScript lambda filter expression:

```ts
(person) => person.Age >= 18 && person.Name.startsWith('A');
```

to an OData `$filter` string:

```
"Age gt 10 and startswith(Name, 'A')"
```

## Introduction

This project contains TypeScript Transformers capable of turning TypeScript lambda functions into OData `$filter`
strings. This allows you to have full type safety while creating an expression with all of the full type information,
but at runtime be working with a generated OData `$filter` string.

For example, consider the following nominal TypeScript:

```ts
import { serializeExpression } from 'ts-lambda-to-odata';

interface Person {
    name: string;
    age: number;
}

const result: string = serializeExpression<Person>((x: Person) => x.age > 10 && x.name == 'Bob');
```

Note that the `serializeExpression<T>` function accepts a `(x: T) => boolean` filter lambda expression.

After compilation, the transpiled JavaScript becomes the following:

```js
const result = `age gt 10 and name eq 'Bob'`;
```

Note that the `serializeExpression<T>` does not actually exist in the final compiled JavaScript; instead, it acts as a
placeholder in TypeScript to be replaced with the OData `$filter` string at compile/transpile-time.

The strings also support external variables. The following TypeScript:

```ts
const num: number = 1234;
const result: string = serializeExpression<Person>(x => x.age <= num);
```

becomes:

```js
const num = 1234;
const result = `age le ${num}`;
```

## Getting Started

### Vanilla Webpack

In a straight TypeScript project, simply add `ts-lambda-to-odata` and `ts-loader` to your project. In your
project's Webpack config, add the `serializeExpressionTransformer` as a custom transformer:

```js
/** webpack.config.js */
const expressionSerializer = require('ts-lambda-to-odata/build-tools');
 
module.exports = {
  // ...
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader', // or 'awesome-typescript-loader'
        options: {
          getCustomTransformers: program => ({
            before: [expressionSerializer.serializeExpressionTransformer(program)],
          }),
        },
      },
    ],
  },
};
```

### Angular (v17+)

In Angular land, it's actually a bit easier:

First, add `ts-lambda-to-odata` and `@angular-builders/custom-webpack` to your project.

In your `angular.json` file, change the builder to `@angular-builders/custom-webpack`, and then add a
`customWebpackConfig` TypeScript file:

```json
"build": {
    "builder": "@angular-builders/custom-webpack:browser",
    "options": {
    "customWebpackConfig": {
        "path": "./webpack.config.ts"
    },
    // ... etc
```

Then, in your custom Webpack config file:

```ts
// webpack.config.ts
import { Configuration } from 'webpack';
import { addSerializeExpressionTransformerToAngularPipeline } from 'ts-lambda-to-odata/build-tools';

export default (config: Configuration) => {
    config = addSerializeExpressionTransformerToAngularPipeline(config);
    return config;
};
```

That's it! All calls to `serializeExpression<T>()` will be replaced with OData strings at runtime.

## Supported operators and functions

This library supports converting most standard TypeScript syntax into OData `$filter` grammar:

| Description           | TypeScript syntax         | OData `$filter` syntax |
|-----------------------|---------------------------|------------------------|
| Equality              | `==`, `===`, `!=`, `!==`  | `eq`, `ne` |
| Comparison            | `>`, `>=`, `<`, `<=`      | `gt`, `ge`, `lt`, `le` |
| Grouping              | `&&`, `\|\|`, `(`, `)`    | `and`, `or`, `(`, `)` |
| Negation              | `!expression`             | `not [expression]` |
| Arithmetic            | `+`, `-`, `*`, `/`, `%`   | `add`, `sub`, `mul`, `div`, `mod` |
| String literals       | `"string"`, `'string'`, `` `string` `` | `'string'` |
| Number literals       | `1234`, `1.23`            | `1234`, `1.23` |
| Boolean literals      | `true`, `false`           | `true`, `false` |
| Nullability literals  | `null`, `undefined`       | `null` |
| String starts with    | `str.startsWith('x')`     | `startswith(str, 'x')` |
| String ends with      | `str.endsWith('x')`       | `endswidth(str, 'x')` |
| String index          | `str.indexOf('x')`        | `indexof(str, 'x')` |
| String substring      | `str.substring(0, 2)`     | `substring(str, 0, 2)` |
| String lowercase      | `str.toLowerCase('ABC')`  | `tolower(str, 'ABC')` |
| String uppercase      | `str.toUpperCase('abc')`  | `toupper(str, 'abc')` |
| String trim           | `str.trim('  hello ')`    | `trim(str, '  hello ')` |
| String includes       | `str.includes('x')`       | `contains(str, 'x')` |
| String length         | `str.length`              | `length(str)` |
| Array contains        | `array.includes(3)`       | `contains(array, 3)` |
| Array index           | `array.indexOf(5)`        | `indexof(arr, 5)` |
| Array at least one    | `items.some(i => i.Value > 10)` | `items/any(i: i/Value gt 10)` |
| Array every           | `items.every(i => i.Value == 5)` | `items/all(i: i/Value eq 5)` |
| Array length          | `items.length`            | `length(items)` |

## Testing

```bash
npm test
```
