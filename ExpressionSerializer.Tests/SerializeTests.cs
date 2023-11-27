using ExpressionSerializer.Tests.Types;

namespace ExpressionSerializer.Tests;

[TestClass]
public class SerializeTests
{
    private ExpressionSerializer _serializer = new();

    [TestMethod]
    public void Test_single_condition()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age > 20);
        Assert.AreEqual("Age gt 20", filter);

        filter = _serializer.Serialize<Person>(p => p.Name.StartsWith('B'));
        Assert.AreEqual("startswith(Name,'B')", filter);
    }

    [TestMethod]
    public void Test_dual_conditions()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age > 5 && p.Name.StartsWith('B'));
        Assert.AreEqual("Age gt 5 and startswith(Name,'B')", filter);
    }

    [TestMethod]
    public void Test_sub_objects()
    {
        string? filter = _serializer.Serialize<Customer>(c => c.Person.Name == "Bob");
        Assert.AreEqual("Person/Name eq 'Bob'", filter);
    }
}
