using ExpressionSerializer.Tests.Types;

namespace ExpressionSerializer.Tests;

[TestClass]
public class DeserializeTests
{
    private readonly IExpressionSerializer _serializer = IExpressionSerializer.Current;

    private readonly Person _person1 = new() { Name = "Alice", Age = 25 };
    private readonly Person _person2 = new() { Name = "Bob", Age = 18 };
    private readonly Person _person3 = new() { Name = "Charlie", Age = 20 };

    private readonly Customer _customer1 = new() { CustomerId = 123, Person = new Person { Name = "Bob", Age = 20 } };
    private readonly Order _order1 = new()
    { 
        Customer = new Customer { Person = new Person { Name = "Alice", Age = 30 } },
        Items = [new() { HistoricPrices = [100, 200, 300] }]
    };

    [TestMethod]
    public void Test_single_condition()
    {
        Func<Person, bool> filter = _serializer.Deserialize<Person>("Age gt 20");
        Assert.IsTrue(filter(_person1));
        Assert.IsFalse(filter(_person2));
        Assert.IsFalse(filter(_person3));
    }

    [TestMethod]
    public void Test_dual_conditions()
    {
        Func<Person, bool> filter = _serializer.Deserialize<Person>("Age gt 5 and startswith(Name, 'B')");
        Assert.IsFalse(filter(_person1));
        Assert.IsTrue(filter(_person2));
        Assert.IsFalse(filter(_person3)); // Assuming startswith is case-sensitive.
    }

    [TestMethod]
    public void Test_subojects()
    {
        Func<Customer, bool> filter = _serializer.Deserialize<Customer>("Person/Name eq 'Bob'");
        Assert.IsTrue(filter(_customer1));
    }

    [TestMethod]
    public void Test_or_conditions()
    {
        Func<Person, bool> filter = _serializer.Deserialize<Person>("Age gt 18 or Name eq 'Alice'");
        Assert.IsTrue(filter(_person1));
        Assert.IsFalse(filter(_person2));
        Assert.IsTrue(filter(_person3));
    }

    [TestMethod]
    public void Test_number_comparisons()
    {
        Func<Person, bool> greaterThanFilter = _serializer.Deserialize<Person>("Age gt 20");
        Assert.IsTrue(greaterThanFilter(_person1)); // Age 25
        Assert.IsFalse(greaterThanFilter(_person2)); // Age 18

        Func<Person, bool> lessThanFilter = _serializer.Deserialize<Person>("Age lt 20");
        Assert.IsFalse(lessThanFilter(_person1)); // Age 25
        Assert.IsTrue(lessThanFilter(_person2)); // Age 18

        Func<Person, bool> notEqualFilter = _serializer.Deserialize<Person>("Age ne 18");
        Assert.IsTrue(notEqualFilter(_person1)); // Age 25
        Assert.IsFalse(notEqualFilter(_person2)); // Age 18
    }

    [TestMethod]
    public void Test_string_operations()
    {
        Func<Person, bool> startsWithFilter = _serializer.Deserialize<Person>("startswith(Name, 'A')");
        Assert.IsTrue(startsWithFilter(_person1)); // Name "Alice"
        Assert.IsFalse(startsWithFilter(_person2)); // Name "Bob"

        Func<Person, bool> endsWithFilter = _serializer.Deserialize<Person>("endswith(Name, 'e')");
        Assert.IsTrue(endsWithFilter(_person1)); // Name "Alice"
        Assert.IsFalse(endsWithFilter(_person2)); // Name "Bob"
        Assert.IsTrue(endsWithFilter(_person3)); // Name "Charlie"

        Func<Person, bool> containsFilter = _serializer.Deserialize<Person>("contains(Name, 'lic')");
        Assert.IsTrue(containsFilter(_person1)); // Name "Alice"
        Assert.IsFalse(containsFilter(_person2)); // Name "Bob"
    }

    [TestMethod]
    public void Test_complex_conditions()
    {
        Func<Order, bool> complexFilter = _serializer.Deserialize<Order>(
            "Customer/Person/Age gt 25 and Items/any(i: i/HistoricPrices/any(p: p gt 150))");
        Assert.IsTrue(complexFilter(_order1));

        Func<Order, bool> negativeComplexFilter = _serializer.Deserialize<Order>(
            "Customer/Person/Age gt 25 and Items/any(i: i/HistoricPrices/any(p: p lt 100))");
        Assert.IsFalse(negativeComplexFilter(_order1));
    }

    [TestMethod]
    public void Test_collection_operations()
    {
        Func<Order, bool> containsFilter = _serializer.Deserialize<Order>(
            "Items/any(i: i/HistoricPrices/any(p: p eq 200))");
        Assert.IsTrue(containsFilter(_order1)); // Contains price 200

        Func<Order, bool> notContainsFilter = _serializer.Deserialize<Order>(
            "Items/any(i: i/HistoricPrices/any(p: p eq 400))");
        Assert.IsFalse(notContainsFilter(_order1)); // Does not contain price 400
    }

    [TestMethod]
    public void Test_subobjects()
    {
        Func<Order, bool> filter = _serializer.Deserialize<Order>("Customer/Person/Name eq 'Alice'");
        Assert.IsTrue(filter(_order1));

        filter = _serializer.Deserialize<Order>("Customer/Person/Age lt 18");
        Assert.IsFalse(filter(_order1));
    }

    [TestMethod]
    public void Test_complex_condition_with_collections()
    {
        Func<Order, bool> filter = _serializer.Deserialize<Order>(
            "Customer/Person/Age gt 25 and Items/any(i: i/HistoricPrices/any(p: p gt 150))");
        Assert.IsTrue(filter(_order1));

        filter = _serializer.Deserialize<Order>(
            "Customer/Person/Age gt 25 and Items/any(i: i/HistoricPrices/any(p: p lt 100))");
        Assert.IsFalse(filter(_order1));
    }
}
