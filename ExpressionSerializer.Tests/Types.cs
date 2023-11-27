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
}