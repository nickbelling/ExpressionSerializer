import { Component } from '@angular/core';
import { serializeExpression } from 'expression-serializer-ts';

interface Person {
  name: string;
  age: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html'
})
export class AppComponent {
  public expression?: string;

  constructor() {
    this.expression = serializeExpression<Person>(p => p.age >= 18 && p.name.startsWith('B'));
  }
}
