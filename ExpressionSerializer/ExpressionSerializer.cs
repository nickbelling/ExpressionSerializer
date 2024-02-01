using System.Linq.Expressions;
using System.Web;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Query.Expressions;
using Microsoft.OData.Client;
using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using Microsoft.OData.UriParser;

namespace ExpressionSerializer;

public class ExpressionSerializer : IExpressionSerializer
{
    public string? Serialize<T>(Expression<Func<T, bool>> expression) where T : class
    {
        try
        {
            DataServiceContext context = new(new Uri("http://localhost"));
            DataServiceQuery<T>? query = context.CreateQuery<T>(typeof(T).Name).Where(expression) as DataServiceQuery<T>;
            Uri? queryUri = query?.RequestUri;
            string? filterString = HttpUtility.ParseQueryString(queryUri!.Query).Get("$filter");
            return filterString;
        }
        catch (NotSupportedException ex)
        {
            ex = HandleSerializeGotchas(ex);
            throw ex;
        }
    }

    public Func<T, bool> Deserialize<T>(string filter) where T : class
    {
        Type elementType = typeof(T);
        IEdmModel model = GetModel<T>();
        FilterClause filterClause = CreateFilterClause(filter, model, elementType);
        
        ODataQuerySettings querySettings = new();
        Expression expression = BindFilter(model, filterClause, elementType, querySettings);

        return ExpressionToFunc<T>(expression);
    }

    private static NotSupportedException HandleSerializeGotchas(NotSupportedException ex)
    {
        if (ex.Message.Contains("IndexOf"))
        {
            ex = new NotSupportedException(
                $"The string IndexOf(char) method is unsupported. Please use the IndexOf(string) method instead.", ex);
        }

        return ex;
    }

    private static IEdmModel GetModel<T>() where T : class
    {
        ODataModelBuilder model = new ODataConventionModelBuilder();
        model.AddComplexType(typeof(T));
        IEdmModel value = model.GetEdmModel();

        return value;
    }

    private static FilterClause CreateFilterClause(string filter, IEdmModel model, Type type)
    {
        IEdmType entityType = model.SchemaElements.OfType<IEdmType>().Single(t => t.FullTypeName() == type.FullName);

        ODataQueryOptionParser parser = new(
            model,
            entityType,
            null,
            new Dictionary<string, string> { { "$filter", filter } });

        return parser.ParseFilter();
    }

    private static Expression BindFilter(IEdmModel model, FilterClause filterClause, Type elementType, ODataQuerySettings querySettings)
    {
        FilterBinder binder = new();
        QueryBinderContext context = new(model, querySettings, elementType)
        {
            //AssembliesResolver = resolver ?? AssemblyResolverHelper.Default,
        };

        return binder.BindFilter(filterClause, context);
    }

    public static Func<T, bool> ExpressionToFunc<T>(Expression expression) where T : class
    {
        // Ensure the expression is a LambdaExpression
        if (expression is not LambdaExpression lambda)
        {
            throw new InvalidOperationException("The provided expression is not a lambda expression.");
        }

        // Ensure the lambda expression is of the correct delegate type
        if (!typeof(Func<T, bool>).IsAssignableFrom(lambda.Type))
        {
            throw new InvalidOperationException("The lambda expression does not match the required delegate type 'Func<T, bool>'.");
        }

        // Compile the lambda expression to a Func<T, bool>
        return (Func<T, bool>)lambda.Compile();
    }
}
