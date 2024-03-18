import ms from "ms";
import { RedisClientType } from "redis";

type TConsumeValue = {
  key: string;
  points: number;
  duration: number;
  blockDuration?: number;
  errorMessage?: string;
  blockedUntil?: number;
  isFinished?: boolean;
};

type consumeValue = {
  points: number;
  duration: string;
};

class RateLimiterRedis {
  redisClient: RedisClientType;

  constructor(redisClient: RedisClientType) {
    this.redisClient = redisClient;
  }

  async intialWrite(this: any, consumeValues: consumeValue[], key: string) {
    const initialValue: TConsumeValue[] = consumeValues.map((value, index) => {
      return {
        key: key + "_" + index,
        points: value.points,
        duration: ms(value.duration),
      };
    });
    initialValue[0].points -= 1;
    await this.redisClient.set(key, JSON.stringify(initialValue));
  }

  async blockAccess(
    this: any,
    storedValue: TConsumeValue,
    storedValueArray: TConsumeValue[],
    storedValueStrIndex: number,
    key: string
  ) {
    storedValue.blockedUntil = Date.now() + storedValue.duration;

    storedValueArray[storedValueStrIndex] = storedValue;
    await this.redisClient.set(key, JSON.stringify(storedValueArray));
  }

  async consume(key: string, consumeValues: consumeValue[]): Promise<boolean> {
    try {
      const currentTime = Date.now();
      const keyExists = await this.redisClient.exists(key);

      switch (!keyExists) {
        case false: {
          const getKey = await this.redisClient.get(key);
          const storedValueArray = JSON.parse(getKey!) as Array<TConsumeValue>;
          const storedValueStrIndex = storedValueArray.findIndex(
            (value) => !value.isFinished
          ) as number;
          const storedValueStr = storedValueArray[storedValueStrIndex];
          console.log(storedValueStrIndex, storedValueStr);
          const { points, duration } = consumeValues[storedValueStrIndex];
          if (storedValueStr) {
            const storedValue: TConsumeValue = storedValueStr;
            const blockDuration = duration;

            switch (!storedValue.points) {
              case true: {
                if (
                  storedValue.blockedUntil &&
                  currentTime < storedValue.blockedUntil
                ) {
                  throw new Error();
                }

                if (
                  storedValue.blockedUntil &&
                  storedValue.blockedUntil < currentTime
                ) {
                  storedValue.isFinished = true;
                  storedValueArray[storedValueStrIndex] = storedValue;
                  await this.redisClient.set(
                    key,
                    JSON.stringify(storedValueArray)
                  );
                  return true;
                }

                if (blockDuration) {
                  await this.blockAccess(
                    storedValue,
                    storedValueArray,
                    storedValueStrIndex,
                    key
                  );
                }
                break;
              }
              default: {
                storedValue.points -= 1;
                if (storedValue.points <= 1) {
                  storedValue.blockedUntil = currentTime + storedValue.duration;
                }
                storedValueArray[storedValueStrIndex] = storedValue;

                await this.redisClient.set(
                  key,
                  JSON.stringify(storedValueArray)
                );
                if (storedValue.points <= 1) throw Error();
                return true;
              }
            }
          }
          break;
        }
        default: {
          await this.intialWrite(consumeValues, key);
          return true;
        }
      }
    } catch (error) {
      throw error;
    }
    return false;
  }
}

export { RateLimiterRedis, consumeValue };
