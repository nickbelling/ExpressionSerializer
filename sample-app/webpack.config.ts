import { Configuration } from 'webpack';
import { addSerializeExpressionTransformerToAngularPipeline } from 'expression-serializer-ts/build-tools';

export default (
    config: Configuration
) => {
    config = addSerializeExpressionTransformerToAngularPipeline(config);
    return config;
};
