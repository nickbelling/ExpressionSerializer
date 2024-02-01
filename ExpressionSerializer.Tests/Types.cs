namespace ExpressionSerializer.Tests.Types;

public record Person
{
    public required string Name { get; init; }
    public required int Age { get; init; }
    public DateTime? DateOfBirth { get; init; }
}

public record Customer
{
    public int CustomerId { get; init; }
    public required Person Person { get; init; }
    public bool IsActive { get; init; }
}

public class Item
{
    public List<int> HistoricPrices { get; set; } = [];
}

public class Order
{
    public required Customer Customer { get; set; }
    public List<Item> Items { get; set; } = [];
}