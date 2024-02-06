using System.Linq.Expressions;
using System.Web;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Query.Expressions;
using Microsoft.OData.Client;
using Microsoft.OData.Edm;
using Microsoft.OData.ModelBuilder;
using Microsoft.OData.UriParser;

namespace ExpressionSerializer;

/// <summary>
/// Serializes expressions of type <see cref="Expression{Func{T,bool}}"/> into OData-compatible <c>$filter</c> strings,
/// and vice versa.
/// </summary>
public static class ExpressionSerializer
{
    /// <summary>
    /// Serializes an expression into an OData <c>$filter</c> string.
    /// </summary>
    /// <typeparam name="T">The type of object being filtered.</typeparam>
    /// <param name="expression">The lambda expression to be serialized.</param>
    /// <returns>The OData <c>$filter</c> equivalent of the provided expression.</returns>
    public static string? Serialize<T>(Expression<Func<T, bool>> expression) where T : class
    {
        try
        {
            // Build a fake query to an OData URI. This will create an OData query that looks like
            // "http://localhost/$filter=Age%20gt$205"
            DataServiceContext context = new(new Uri("http://localhost"));
            DataServiceQuery<T>? query = context
                .CreateQuery<T>(typeof(T).Name)
                .Where(expression) as DataServiceQuery<T>;

            // Now, take the request URI and just extract the $filter part from it
            Uri? queryUri = query?.RequestUri;
            string? filterString = HttpUtility.ParseQueryString(queryUri!.Query).Get("$filter");

            // Done! We have our OData $filter string.
            return filterString;
        }
        catch (Exception ex)
        {
            ex = HandleSerializeGotchas(ex);
            throw ex;
        }
    }

    /// <summary>
    /// Deserializes an OData <c>$filter</c> string into a <see cref="Func{T,bool}"/>.
    /// </summary>
    /// <typeparam name="T">The object type the expression is filtering on.</typeparam>
    /// <param name="filter">The OData <c>$filter</c> string to turn into a <see cref="Func{T,bool}"/>.</param>
    /// <returns></returns>
    public static Func<T, bool> Deserialize<T>(string filter) where T : class
    {
        // Get the OData model for this type
        IEdmModel model = GetModel<T>();

        // Create the filter clause
        FilterClause filterClause = CreateFilterClause<T>(filter, model);
        
        // Bind the filter clause to a C# Expression
        Expression expression = BindFilter<T>(model, filterClause);

        // Compile the Expression into the Func we want
        return ExpressionToFunc<T>(expression);
    }

    /// <summary>
    /// Rethrows some exceptions thrown by the DataServiceQuery parser with more helpful errors.
    /// </summary>
    /// <param name="ex"></param>
    /// <returns></returns>
    private static Exception HandleSerializeGotchas(Exception ex)
    {
        if (ex is NotSupportedException && ex.Message.Contains("IndexOf"))
        {
            ex = new NotSupportedException(
                $"The string IndexOf(char) method is unsupported. Please use the IndexOf(string) method instead.", ex);
        }

        return ex;
    }

    /// <summary>
    /// For the class of type T, builds its Entity Data Model (required for parsing it with the OData libraries).
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <returns></returns>
    private static IEdmModel GetModel<T>() where T : class
    {
        ODataModelBuilder model = new ODataConventionModelBuilder();
        model.AddComplexType(typeof(T));
        IEdmModel value = model.GetEdmModel();
        return value;
    }

    /// <summary>
    /// Given an OData $filter string and the model it should be bound to, create a <see cref="FilterClause"/> that can
    /// be used to fake an OData request so that we can extract the Expression representing the filter.
    /// </summary>
    /// <param name="filter"></param>
    /// <param name="model"></param>
    /// <param name="type"></param>
    /// <returns></returns>
    private static FilterClause CreateFilterClause<T>(string filter, IEdmModel model) where T : class
    {
        Type type = typeof(T);

        IEdmType entityType = model.SchemaElements.OfType<IEdmType>().Single(t => t.FullTypeName() == type.FullName);

        ODataQueryOptionParser parser = new(
            model,
            entityType,
            null,
            new Dictionary<string, string> { { "$filter", filter } });

        return parser.ParseFilter();
    }

    /// <summary>
    /// The magic happens here; builds an Expression from the given model and filter clause. The Expression *will* be
    /// a compilable LambdaExpression of a Func{T,bool} if this works.
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="model"></param>
    /// <param name="filterClause"></param>
    /// <returns></returns>
    private static Expression BindFilter<T>(
        IEdmModel model, FilterClause filterClause)
        where T : class
    {
        Type type = typeof(T);
        FilterBinder binder = new();
        ODataQuerySettings querySettings = new();
        QueryBinderContext context = new(model, querySettings, type)
        {
            //AssembliesResolver = resolver ?? AssemblyResolverHelper.Default,
        };

        return binder.BindFilter(filterClause, context);
    }

    /// <summary>
    /// Given an Expression that's presumed to be a <see cref="LambdaExpression"/>, compiles it into a
    /// <see cref="Func{T,bool}"/>.
    /// </summary>
    /// <typeparam name="T"></typeparam>
    /// <param name="expression"></param>
    /// <returns></returns>
    /// <exception cref="InvalidOperationException"></exception>
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
