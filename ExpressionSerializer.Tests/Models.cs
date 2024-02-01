namespace ExpressionSerializer.Tests;

public class Product
{
    public int ProductID { get; set; }

    public string ProductName { get; set; }
    public int SupplierID { get; set; }
    public int CategoryID { get; set; }
    public string QuantityPerUnit { get; set; }
    public decimal? UnitPrice { get; set; }
    public double? Weight { get; set; }
    public float? Width { get; set; }
    public short? UnitsInStock { get; set; }
    public short? UnitsOnOrder { get; set; }

    public short? ReorderLevel { get; set; }
    public bool? Discontinued { get; set; }
    public DateTimeOffset? DiscontinuedDate { get; set; }
    public DateTime Birthday { get; set; }

    public DateTimeOffset NonNullableDiscontinuedDate { get; set; }
    public DateTimeOffset NotFilterableDiscontinuedDate { get; set; }

    public DateTimeOffset DiscontinuedOffset { get; set; }
    public TimeSpan DiscontinuedSince { get; set; }

    public Guid GuidProperty { get; set; }
    public Guid? NullableGuidProperty { get; set; }

    public ushort? UnsignedReorderLevel { get; set; }

    public SimpleEnum Ranking { get; set; }

    public Category Category { get; set; }

    public Address SupplierAddress { get; set; }

    public int[] AlternateIDs { get; set; }
    public Address[] AlternateAddresses { get; set; }
}

public class DerivedProduct : Product
{
    public string DerivedProductName { get; set; }
}

public class DynamicProduct : Product
{
    public Dictionary<string, object> ProductProperties { get; set; }
}

public class Address
{
    public string StreetAddress { get; set; }

    public string City { get; set; }

    public string Street { get; set; }

    public string State { get; set; }

    public int HouseNumber { get; set; }

    public string IgnoreThis { get; set; }
}

public enum SimpleEnum
{
    First,

    Second,

    Third,

    Fourth
}
public class Category
{
    public int CategoryID { get; set; }
    public string CategoryName { get; set; }

    public Product Product { get; set; }

    public IEnumerable<Product> Products { get; set; }

    public IEnumerable<Product> EnumerableProducts { get; set; }

    public IQueryable<Product> QueryableProducts { get; set; }
}

public class DerivedCategory : Category
{
    public string DerivedCategoryName { get; set; }
}
