using System.Linq.Expressions;

namespace ExpressionSerializer;

public static class ExpressionHelper
{
    

    public static Func<T,bool> ToFunc<T>(Expression expression) where T : class
    {
        // "expression" is a logical binary expression now, which is close. We need to make a LambdaExpression.
        // First, find the part of the expression that represents the parameter (e.g. the "x" in "x => x.Blah == 123").
        ParameterExpression parameter = GetRootParameterExpression(expression);

        // Finally, build the lambda expression and compile it into the Func<T,bool>
        Expression<Func<T, bool>> lambda = Expression.Lambda<Func<T, bool>>(expression, parameter);
        return lambda.Compile();
    }

    /// <inheritdoc cref="GetParameterExpression"/>
    internal static ParameterExpression GetRootParameterExpression(Expression expression)
    {
        ParameterExpression? parameterExpression = GetParameterExpression(expression);
        if (parameterExpression is null)
            throw new InvalidOperationException("Unable to find parameter expression.");
        else return parameterExpression;
    }

    /// <summary>
    /// Given an <see cref="Expression"/> that most likely represents a Lambda
    /// (e.g. <c>x => x.Something == 123</c>), parses it for its containing <see cref="ParameterExpression"/> (i.e. the
    /// <c>"x =>"</c> part), and returns it.
    /// </summary>
    /// <param name="expression"></param>
    /// <returns></returns>
    /// <exception cref="InvalidOperationException"></exception>
    internal static ParameterExpression? GetParameterExpression(Expression expression)
    {
        switch (expression)
        {
            case MemberExpression memberExpression:
                if (memberExpression.Expression is null)
                    throw new InvalidOperationException($"Could not parse the provided {nameof(MemberExpression)}.");
                else
                    return GetParameterExpression(memberExpression.Expression);

            case BinaryExpression binaryExpression:
                // Check the left side first, then the right side
                ParameterExpression? leftParameter = GetParameterExpression(binaryExpression.Left);
                return leftParameter ?? GetParameterExpression(binaryExpression.Right);

            case ParameterExpression parameterExpression:
                return parameterExpression;

            case UnaryExpression unaryExpression:
                return GetParameterExpression(unaryExpression.Operand);

            default:
                return null;
        }
    }
}