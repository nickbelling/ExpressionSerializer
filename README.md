# Cross-Language Expression Serialization

Allows you to serialize type-safe lambda expressions (in various languages) to OData `$filter`-style strings. This
enables cross-platform filtering of objects.

## The intent

The possibilities are endless, but for me, this is most useful for exposing pub/sub notification subscriptions for a
RESTful API. From any (supported) language, I can type a lambda like this:

```cs
await SubscribeAsync<PersonAdded>(
    // Subscription filter: only receive notifications for adults whose names begin with "A"
    p => p.Age > 18 && p.Name.StartsWith("A"),
    // Callback
    p => Console.WriteLine($"{p.Name} was added."));
```

Inside `SubscribeAsync`, the first argument, an `Expression` that accepts a type `T` object and returns a `bool`, is
automatically serialized to a string for easy passing to a RESTful API. The above example
(`p => p.Age > 18 && p.Name.StartsWith("A")`) becomes the string `"Age gt 18 and startswith(Name, 'A')"`. This can be
easily deserialized and compiled back into the original lambda server-side, and used for filtering notification objects
of type `PersonAdded`. Those server-filtered notifications can then be sent to the client, where the callback can be
invoked.

Here's a simplified C# client-side example:

```cs
public class MyClass(Notifications notifications)
{
    private List<Guid> _subscriptions = [];

    public Task StartAsync()
    {
        _subscriptions.Add(await notifications.SubscribeAsync<PersonAdded>(p => p.Age >= 18, AdultAdded));
        _subscriptions.Add(await notifications.SubscribeAsync<PersonAdded>(p => p.Age < 18, ChildAdded));
        _subscriptions.Add(await notifications.SubscribeAsync<PersonRemoved>(p => true, PersonRemoved));
    }

    public Task StopAsync()
    {
        foreach(Guid subscriptionId in _subscriptions)
        {
            await notifications.UnsubscribeAsync(subscriptionId);
        }
    }

    public void ChildAdded(PersonAdded child) { /* ... */ }
    public void AdultAdded(PersonAdded adult) { /* ... */ }
    public void PersonRemoved(PersonRemoved person) { /* ... */ }
}
```

An example implementation of `Notifications` is found in the
[client-side notification class examples](#c-notification-class-example) section below.

And a similar TypeScript example:

```ts
import { Subscription } from 'rxjs';
import { serializeExpression } from 'ts-lambda-to-odata';

export class MyClass {
    private _subscriptions: Subscription[];

    constructor(private notifications: Notifications) {
        _subscriptions.add(notifications.subscribe<PersonAdded>(
            // Note - we call `serializeExpression` here rather than passing the expression into this function.
            // In future, `ts-lambda-to-odata` may handle receiving a func it can then parse, but currently it can't.
            'PersonAdded', serializeExpression<PersonAdded>(p => p.Age >= 18)
        ).subscribe({
            next: (adult) => this.adultAdded(adult)
        }));

        _subscriptions.add(notifications.subscribe<PersonAdded>(
            'PersonAdded', serializeExpression<PersonAdded>(p => p.Age < 18)
        ).subscribe({
            next: (child) => this.childAdded(child)
        }));

        _subscriptions.add(notifications.subscribe<PersonRemoved>(
            'PersonRemoved', serializeExpression<PersonRemoved>(p => true)
        ).subscribe({
            next: (person) => this.personRemoved(person)
        }));
    }

    // Callbacks
    private adultAdded(adult: PersonAdded): void { console.log('Adult added:', adult); }
    private childAdded(child: PersonAdded): void { console.log('Child added:', child); }
    private personRemoved(person: PersonRemoved): void { console.log('Person removed:', person); }

    public dispose(): void {
        this._subscriptions.forEach(s => s.unsubscribe());
    }
}
```

An example implementation of `Notifications` is found in the
[client-side notification class examples](#typescript-notification-class-example) section below.

See `/src/typescript/sample-app` for an example of how `serializeExpression` can be used practically, and
[the `ts-lambda-to-odata` README](./src/typescript/ts-lambda-to-odata/README.md) for information on how to integrate the
library.


## Building

### C#

```bash
dotnet build
```

### TypeScript

```bash
npm install
npm run build
```

## Sample applications

### C#

None.

### TypeScript

```bash
npm run start
```

## Unit tests

### C#

```bash
dotnet test
```

### TypeScript

```bash
npm test
```

## Client-side notification class examples

The below examples are very basic and don't include error-handling logic.

### C# notification class example

Assume that `MyServerApi` exposes a `SubscribeAsync` method that returns a `Guid` ID, and successful subscriptions will
cause those notifications to begin appearing in the `MyServerWebsocket`'s `OnNotification` callback.

```cs
public class Notifications
{
    private Dictionary<Guid, Action<object>> _callbacks = [];
    private MyServerApi _server;

    public Notifications(MyServerApi server, MyServerWebsocket websocket)
    {
        _server = server;
        websocket.OnNotification += (notification) => {
            OnNotificationReceived(notification.SubscriptionId, notification.Data);
        };
    }

    public async Task<Guid> SubscribeAsync<T>(Func<T, bool> expression, Action<T> callback)
    {
        // Get type name
        string typeName = typeof(T).Name;

        // Convert lambda to OData string
        string serializedExpression = ExpressionSerializer.Serialize<T>(expression);

        // Subscribe to notifications on the server
        Guid subscriptionId = await _server.SubscribeAsync(typeName, serializedExpression);

        // Store the callback
        _callbacks.Add(subscriptionId, (notification) => callback((T)notification));

        // Return the subscription ID so that we can use it to unsubscribe
        return subscriptionId;
    }

    public void OnNotificationReceived(Guid subscriptionId, object notification)
    {
        // Get the callback
        if (_callbacks.TryGetValue(subscriptionId, out Action<object> callback))
        {
            // Invoke the callback with the notification object
            callback(notification);
        }
    }
}
```

### TypeScript notification class example

Note that because `serializeExpression` only works at the site of the original call, this class doesn't handle
serializing the lambda - the caller does.

```ts
import { Observer, Observable } from 'rxjs';

export class Notifications {
    private _callbacks: { [subscriptionId: string]: Observer } = {};

    constructor(
        private server: MyServerApi,
        private websocket: MyWebsocket) {
        
        websocket.on('notification', (notification) =>
            this.onNotification(notification.subscriptionId, notification.data)
        );
    }

    public subscribe<T>(typeName: string, serializedExpression: string): Observable<T> {
        return new Observable<T>(observer => {
            const serverSubscription = server
                .subscribe(typeName, serializedExpression)
                .subscribe({
                    next: (subscriptionId: string) => {
                        this._callbacks[subscriptionId] = observer;
                        // Setup the teardown logic when unsubscribe is called
                        observer.add(() => {
                            this.server.unsubscribe(subscriptionId);
                            delete this._callbacks[subscriptionId];
                        });
                    },
                    error: (err) => observer.error(err)
                    }
                );

            // Add serverSubscription to the observer's teardown logic
            observer.add(() => serverSubscription.unsubscribe());
        });
    }

    private onNotification(subscriptionId: string, data: any): void {
        _callbacks[subscriptionId]?.next(data);
    }
}
```
