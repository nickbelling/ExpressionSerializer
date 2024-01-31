import { Configuration } from 'webpack';
import { addSerializeExpressionTransformerToAngularPipeline } from 'ts-lambda-to-odata/build-tools';

export default (config: Configuration) => {
    config = addSerializeExpressionTransformerToAngularPipeline(config);
    return config;
};
