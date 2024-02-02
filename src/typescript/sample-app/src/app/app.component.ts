import { Component } from '@angular/core';
import { serializeExpression } from 'ts-lambda-to-odata';

interface Person {
  name: string;
  age: number;
}

class ExpressionTest {
  constructor(
    public expected: string,
    public actual: string) {}
}

declare const VERSION: string;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html'
})
export class AppComponent {
  public tests: ExpressionTest[] = [];

  constructor() {
    this.tests.push(new ExpressionTest(
      "age ge 18 and name eq 'Bob'",
      serializeExpression<Person>(p => p.age >= 18 && p.name == "Bob")
    ));

    this.tests.push(new ExpressionTest(
      "startswith(name, 'B')",
      serializeExpression<Person>(p => p.name.startsWith('B'))
    ));

    console.log(this);
  }
}
