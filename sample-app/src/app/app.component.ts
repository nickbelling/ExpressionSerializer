import { Component } from '@angular/core';
import { serializeExpression } from 'expression-serializer-ts';

interface Person {
  name: string;
  age: number;
}

declare const VERSION: string;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  template: `
    <h1>Hello!</h1>
    <h2>Expression: <code>{{expression}}</code></h2>

    <ul>
        @for (error of errors; track error) {
            <li>{{error}}</li>
        }
    </ul>`
})
export class AppComponent {
  public expression?: string = '';
  public errors: any[] = [];

  constructor() {
    try{
      this.expression = serializeExpression<Person>(p => p.age >= 18 && p.name.startsWith('B'));
    } catch (error) {
      console.error(error);
      this.errors.push(error);
    }

    console.log(this);
  }
}
