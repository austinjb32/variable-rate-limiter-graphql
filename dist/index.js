"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiterRedis = void 0;
const ms_1 = __importDefault(require("ms"));
class RateLimiterRedis {
    constructor(redisClient) {
        this.redisClient = redisClient;
    }
    intialWrite(consumeValues, key) {
        return __awaiter(this, void 0, void 0, function* () {
            const initialValue = consumeValues.map((value, index) => {
                return {
                    key: key + "_" + index,
                    points: value.points,
                    duration: (0, ms_1.default)(value.duration),
                };
            });
            initialValue[0].points -= 1;
            yield this.redisClient.set(key, JSON.stringify(initialValue));
        });
    }
    blockAccess(storedValue, storedValueArray, storedValueStrIndex, key) {
        return __awaiter(this, void 0, void 0, function* () {
            storedValue.blockedUntil = Date.now() + storedValue.duration;
            storedValueArray[storedValueStrIndex] = storedValue;
            yield this.redisClient.set(key, JSON.stringify(storedValueArray));
        });
    }
    consume(key, consumeValues) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const currentTime = Date.now();
                const keyExists = yield this.redisClient.exists(key);
                switch (!keyExists) {
                    case false: {
                        const getKey = yield this.redisClient.get(key);
                        const storedValueArray = JSON.parse(getKey);
                        const storedValueStrIndex = storedValueArray.findIndex((value) => !value.isFinished);
                        const storedValueStr = storedValueArray[storedValueStrIndex];
                        console.log(storedValueStrIndex, storedValueStr);
                        const { points, duration } = consumeValues[storedValueStrIndex];
                        if (storedValueStr) {
                            const storedValue = storedValueStr;
                            const blockDuration = duration;
                            switch (!storedValue.points) {
                                case true: {
                                    if (storedValue.blockedUntil &&
                                        currentTime < storedValue.blockedUntil) {
                                        throw new Error();
                                    }
                                    if (storedValue.blockedUntil &&
                                        storedValue.blockedUntil < currentTime) {
                                        storedValue.isFinished = true;
                                        storedValueArray[storedValueStrIndex] = storedValue;
                                        yield this.redisClient.set(key, JSON.stringify(storedValueArray));
                                        return true;
                                    }
                                    if (blockDuration) {
                                        yield this.blockAccess(storedValue, storedValueArray, storedValueStrIndex, key);
                                    }
                                    break;
                                }
                                default: {
                                    storedValue.points -= 1;
                                    if (storedValue.points <= 1) {
                                        storedValue.blockedUntil = currentTime + storedValue.duration;
                                    }
                                    storedValueArray[storedValueStrIndex] = storedValue;
                                    yield this.redisClient.set(key, JSON.stringify(storedValueArray));
                                    if (storedValue.points <= 1)
                                        throw Error();
                                    return true;
                                }
                            }
                        }
                        break;
                    }
                    default: {
                        yield this.intialWrite(consumeValues, key);
                        return true;
                    }
                }
            }
            catch (error) {
                throw error;
            }
            return false;
        });
    }
}
exports.RateLimiterRedis = RateLimiterRedis;
