export interface Person {
    name: string;
    age: number;
}

export interface Customer {
    person: Person;
    customerId: number;
    signupDate: string;
}
