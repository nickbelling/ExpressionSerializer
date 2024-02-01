using ExpressionSerializer.Tests.Types;
using System.Diagnostics.CodeAnalysis;

namespace ExpressionSerializer.Tests;

[TestClass]
[SuppressMessage("Performance", "CA1866:Use char overload", Justification = "Testing for specifically this.")]
public class SerializeTests
{
    private readonly IExpressionSerializer _serializer = IExpressionSerializer.Current;

    [TestMethod]
    public void Test_single_conditions()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age > 20);
        AssertAreEqual("Age gt 20", filter);

        filter = _serializer.Serialize<Person>(p => p.Name.StartsWith("B"));
        AssertAreEqual("startswith(Name,'B')", filter);
    }

    [TestMethod]
    public void Test_sub_objects()
    {
        string? filter = _serializer.Serialize<Customer>(c => c.Person.Name == "Bob");
        AssertAreEqual("Person/Name eq 'Bob'", filter);
    }

    [TestMethod]
    public void Test_negative_conditions()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age < 30);
        AssertAreEqual("Age lt 30", filter);

        filter = _serializer.Serialize<Person>(p => p.Name.EndsWith("Smith") == false);
        AssertAreEqual("endswith(Name, 'Smith') eq false", filter);
    }

    [TestMethod]
    public void Test_and_conditions()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age > 5 && p.Name.StartsWith("B"));
        AssertAreEqual("Age gt 5 and startswith(Name,'B')", filter);
    }

    [TestMethod]
    public void Test_or_conditions()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age > 18 || p.Name == "Alice");
        AssertAreEqual("Age gt 18 or Name eq 'Alice'", filter);
    }

        [TestMethod]
    public void Test_greater_than_numbers()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Age > 15);
        AssertAreEqual("Age gt 15", filter);
    }

    [TestMethod]
    public void Test_less_than_numbers()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Age < 18);
        AssertAreEqual("Age lt 18", filter);
    }

    [TestMethod]
    public void Test_equal_to_numbers()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Age == 30);
        AssertAreEqual("Age eq 30", filter);
    }

    [TestMethod]
    public void Test_not_equal_to_numbers()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Age != 0);
        AssertAreEqual("Age ne 0", filter);
    }

    [TestMethod]
    public void Test_equal_to_strings()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name == "Bob");
        AssertAreEqual("Name eq 'Bob'", filter);
    }

    [TestMethod]
    public void Test_not_equal_to_strings()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name != "Bob");
        AssertAreEqual("Name ne 'Bob'", filter);
    }

    [TestMethod]
    public void Test_null_strings()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name == null);
        AssertAreEqual("Name eq null", filter);
    }

    [TestMethod]
    public void Test_string_StartsWith()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name.StartsWith("B"));
        AssertAreEqual("startswith(Name,'B')", filter);
    }

    [TestMethod]
    public void Test_string_EndsWith()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name.EndsWith("B"));
        AssertAreEqual("endswith(Name, 'B')", filter);
    }

    [TestMethod]
    public void Test_string_Contains()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name.Contains("ob"));
        AssertAreEqual("contains(Name, 'ob')", filter);
    }

    [TestMethod]
    public void Test_string_Substring()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name.Substring(1, 2) == "ob");
        AssertAreEqual("substring(Name, 1, 2) eq 'ob'", filter);
    }

    [TestMethod]
    public void Test_string_IndexOf()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name.IndexOf("b") == 2);
        AssertAreEqual("indexof(Name, 'b') eq 2", filter);
        Assert.ThrowsException<NotSupportedException>(() => _serializer.Serialize<Person>(x => x.Name.IndexOf('b') == 2));
    }

    [TestMethod]
    public void Test_string_Length()
    {
        string? filter = _serializer.Serialize<Person>(x => x.Name.Length == 3);
        AssertAreEqual("length(Name) eq 3", filter);
    }

    [TestMethod]
    public void Test_explicit_booleans()
    {
        string? filter = _serializer.Serialize<Customer>(c => c.IsActive == true);
        AssertAreEqual("IsActive eq true", filter);
    }

    [TestMethod]
    public void Test_implicit_booleans()
    {
        string? filter = _serializer.Serialize<Customer>(c => c.IsActive);
        AssertAreEqual("IsActive", filter);
    }

    [TestMethod]
    public void Test_negative_booleans()
    {
        string? filter = _serializer.Serialize<Customer>(c => !c.IsActive);
        AssertAreEqual("not IsActive", filter);
    }

    [TestMethod]
    public void Test_array_Length()
    {
        string? filter = _serializer.Serialize<Item>(x => x.HistoricPrices.Count > 5);
        // Adjusting to use "Count" for .NET collections
        AssertAreEqual("HistoricPrices/$count gt 5", filter);
    }

    [TestMethod]
    public void Test_any_collections()
    {
        string? filter = _serializer.Serialize<Order>(x => x.Items.Any(i => i.HistoricPrices.Count > 1));
        AssertAreEqual("Items/any(i: i/HistoricPrices/$count gt 1)", filter);
    }

    [TestMethod]
    public void Test_all_collections()
    {
        string? filter = _serializer.Serialize<Item>(x => x.HistoricPrices.All(p => p > 10));
        AssertAreEqual("HistoricPrices/all(p: p gt 10)", filter);
    }

    [TestMethod]
    public void Test_none_collections()
    {
        string? filter = _serializer.Serialize<Order>(x => x.Items.Any(i => i.HistoricPrices.Any(p => p == 11)) == false);
        AssertAreEqual("Items/any(i: i/HistoricPrices/any(p: p eq 11)) eq false", filter);
    }

    [TestMethod]
    public void Test_external_function_calls()
    {
        string? filter = _serializer.Serialize<Person>(p => p.Age > GetNumber(10));
        AssertAreEqual("Age gt 10", filter);
    }

    [TestMethod]
    public void Test_external_variables()
    {
        int number = 15;
        string? filter = _serializer.Serialize<Person>(p => p.Age > number);
        AssertAreEqual("Age gt 15", filter);
    }

    private static void AssertAreEqual(string? expected, string? actual)
    {
        Assert.AreEqual(Normalize(expected), Normalize(actual));
    }

    private static string? Normalize(string? filter)
    {
        return filter?
            .Replace(", ", ",")
            .Replace(": ", ":");
    }

    private static int GetNumber(int number)
    {
        return number;
    }
}
