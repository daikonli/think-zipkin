"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const zipkin = require("zipkin");
const url = require("url");
const getHeaderValue = (req, headerName) => {
    // req.get() 方法本身就是不区分大小写的，eg：X-B3-TraceId 和 x-b3-traceid 可以获取相同的数据
    return req.get(headerName);
};
const containsRequiredHeaders = (req) => {
    return getHeaderValue(req, zipkin.HttpHeaders.TraceId) !== ''
        && getHeaderValue(req, zipkin.HttpHeaders.SpanId) !== '';
};
const formatRequestUrl = (req) => {
    const parsed = url.parse(req.originalUrl);
    return url.format({
        protocol: req.protocol,
        host: req.header['host'],
        pathname: parsed.pathname,
        search: parsed.search
    });
};
const readHeader = (req, headerName) => {
    const val = getHeaderValue(req, headerName);
    if (val != null) {
        return new zipkin.option.Some(val);
    }
    else {
        return zipkin.option.None;
    }
};
module.exports = (options) => {
    const tracer = options.tracer;
    const serviceName = options.serviceName || 'unknown';
    const port = options.port || 0;
    if (!tracer) {
        return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
            yield next();
        });
    }
    return (ctx, next) => __awaiter(this, void 0, void 0, function* () {
        const req = ctx.request;
        const res = ctx.response;
        ctx.response.set('Access-Control-Allow-Origin', '*');
        ctx.response.set('Access-Control-Allow-Headers', [
            'Origin', 'Accept', 'X-Requested-With', 'X-B3-TraceId',
            'X-B3-ParentSpanId', 'X-B3-SpanId', 'X-B3-Sampled'
        ].join(', '));
        if (containsRequiredHeaders(req)) {
            const spanId = readHeader(req, zipkin.HttpHeaders.SpanId);
            spanId.ifPresent((sid) => {
                const childId = new zipkin.TraceId({
                    traceId: `${readHeader(req, zipkin.HttpHeaders.TraceId)}`,
                    parentId: readHeader(req, zipkin.HttpHeaders.ParentSpanId),
                    spanId: sid,
                    sampled: readHeader(req, zipkin.HttpHeaders.Sampled)[1]
                });
                tracer.setId(childId);
            });
        }
        else {
            const rootId = tracer.createRootId();
            if (getHeaderValue(req, zipkin.HttpHeaders.Flags)) {
                const rootIdWithFlags = new zipkin.TraceId({
                    traceId: rootId.traceId,
                    parentId: rootId.parentId,
                    spanId: rootId.spanId,
                    sampled: rootId.sampled
                });
                tracer.setId(rootIdWithFlags);
            }
            else {
                tracer.setId(rootId);
            }
        }
        const traceId = tracer.id;
        tracer.scoped(() => {
            tracer.setId(traceId);
            tracer.recordServiceName(serviceName);
            tracer.recordRpc(req.method.toUpperCase());
            tracer.recordBinary('http.url', formatRequestUrl(req));
            tracer.recordAnnotation(new zipkin.Annotation.ServerRecv());
            tracer.recordLocalAddr({ port });
            // tracer.recordAnnotation(new zipkin.Annotation.LocalAddr({port}))
            if (traceId.flags !== 0 && traceId.flags != null) {
                tracer.recordBinary(zipkin.HttpHeaders.Flags, traceId.flags.toString());
            }
        });
        ctx[zipkin.HttpHeaders.TraceId] = traceId;
        yield next();
        tracer.scoped(() => {
            tracer.setId(traceId);
            tracer.recordBinary('http.status_code', res.status.toString());
            tracer.recordAnnotation(new zipkin.Annotation.ServerSend());
        });
    });
};
//# sourceMappingURL=index.js.map