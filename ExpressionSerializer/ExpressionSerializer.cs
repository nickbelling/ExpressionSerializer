using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using Microsoft.OData.UriParser;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Query.Expressions;
using System.Linq.Expressions;
using Microsoft.Rest.Azure.OData;

namespace ExpressionSerializer;
public class ExpressionSerializer
{
    public string? Serialize<T>(Expression<Func<T, bool>> expression)
    {
        UrlExpressionVisitor visitor = new(expression.Parameters.First());
        visitor.Visit(expression);
        return visitor.ToString();
    }

    public Func<T, bool> Deserialize<T>(string filterString) where T : class
    {
        // Generate EDM model for type T
        IEdmModel model = GenerateEdmModel<T>();

        // Get the EDM type for the entity
        IEdmEntityType? edmType = model.FindDeclaredType(typeof(T).FullName) as IEdmEntityType;
        IEdmEntitySet edmNavigationSource = model.EntityContainer.FindEntitySet(typeof(T).Name);

        // Parse the OData filter string
        ODataQueryOptionParser parser = new(
            model,
            edmType,
            edmNavigationSource,
            new Dictionary<string, string> { { "$filter", filterString } });
        FilterClause filterClause = parser.ParseFilter();

        // Create ODataQuerySettings and QueryBinderContext
        ODataQuerySettings querySettings = new();
        QueryBinderContext context = new(model, querySettings, typeof(T));

        // Use FilterBinder to bind the filter clause to a LINQ expression
        FilterBinder binder = new();
        Expression expression = binder.Bind(filterClause.Expression, context);

        // "expression" is a logical binary expression now, which is close. We need to make a lambda.
        // First, find the 
        ParameterExpression parameter = GetParameterExpression(expression, true);
        Expression<Func<T, bool>> lambda = Expression.Lambda<Func<T, bool>>(expression, parameter);

        return lambda.Compile();
    }

    private static IEdmModel GenerateEdmModel<T>() where T : class
    {
        ODataConventionModelBuilder builder = new();
        EntityTypeConfiguration entity = builder.AddEntityType(typeof(T));
        entity.HasKey(typeof(T).GetProperties().First());
        builder.AddEntitySet(typeof(T).Name, entity);
        return builder.GetEdmModel();
    }

    private static ParameterExpression? GetParameterExpression(Expression expression, bool isRoot = true)
    {
        switch (expression)
        {
            case MemberExpression memberExpression:
                return GetParameterExpression(memberExpression.Expression, false);

            case BinaryExpression binaryExpression:
                // Check the left side first, then the right side
                ParameterExpression? leftParameter = GetParameterExpression(binaryExpression.Left, false);
                return leftParameter ?? GetParameterExpression(binaryExpression.Right, false);

            case ParameterExpression parameterExpression:
                return parameterExpression;

            case UnaryExpression unaryExpression:
                return GetParameterExpression(unaryExpression.Operand, false);

            default:
                if (isRoot) throw new InvalidOperationException("Unable to find parameter expression.");
                else return null;
        }
    }
}
