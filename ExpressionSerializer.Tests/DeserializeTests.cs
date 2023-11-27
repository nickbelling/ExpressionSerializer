using ExpressionSerializer.Tests.Types;

namespace ExpressionSerializer.Tests;

[TestClass]
public class DeserializeTests
{
    private ExpressionSerializer _serializer = new();

    private Person _person1 = new() { Name = "Foo", Age = 25 };
    private Person _person2 = new() { Name = "Bar", Age = 18 };
    private Person _person3 = new() { Name = "Baz", Age = 20 };

    private Customer _customer1 = new() { CustomerId = 123, Person = new() { Name = "Bob", Age = 20 } };

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
        Assert.IsTrue(filter(_person3));
    }

    [TestMethod]
    public void Test_sub_objects()
    {
        Func<Customer, bool> filter = _serializer.Deserialize<Customer>("Person/Name eq 'Bob'");
        Assert.IsTrue(filter(_customer1));
    }
}
