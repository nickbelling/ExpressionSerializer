using System.Linq.Expressions;
using System.Transactions;

namespace ExpressionSerializer;

public interface IExpressionSerializer
{
    string? Serialize<T>(Expression<Func<T, bool>> expression) where T : class;
    Func<T,bool> Deserialize<T>(string filter) where T : class;

    public static IExpressionSerializer Current = new ExpressionSerializer();
}
