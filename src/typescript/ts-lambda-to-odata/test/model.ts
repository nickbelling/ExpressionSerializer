export interface Person {
    name: string;
    age: number;
}

export interface Customer {
    person: Person;
    customerId: number;
    signupDate: string;
    orders: Order[];
    isActive: boolean;
}

export interface Order {
    items: Item[];
}

export interface Item {
    description: string;
    currentPrice: number;
    historicPrices: number[];
}
