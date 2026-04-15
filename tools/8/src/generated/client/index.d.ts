
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model CCUser
 * 
 */
export type CCUser = $Result.DefaultSelection<Prisma.$CCUserPayload>
/**
 * Model CCWizardAnswers
 * 
 */
export type CCWizardAnswers = $Result.DefaultSelection<Prisma.$CCWizardAnswersPayload>
/**
 * Model CCRoadmap
 * 
 */
export type CCRoadmap = $Result.DefaultSelection<Prisma.$CCRoadmapPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more CCUsers
 * const cCUsers = await prisma.cCUser.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more CCUsers
   * const cCUsers = await prisma.cCUser.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.cCUser`: Exposes CRUD operations for the **CCUser** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CCUsers
    * const cCUsers = await prisma.cCUser.findMany()
    * ```
    */
  get cCUser(): Prisma.CCUserDelegate<ExtArgs>;

  /**
   * `prisma.cCWizardAnswers`: Exposes CRUD operations for the **CCWizardAnswers** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CCWizardAnswers
    * const cCWizardAnswers = await prisma.cCWizardAnswers.findMany()
    * ```
    */
  get cCWizardAnswers(): Prisma.CCWizardAnswersDelegate<ExtArgs>;

  /**
   * `prisma.cCRoadmap`: Exposes CRUD operations for the **CCRoadmap** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more CCRoadmaps
    * const cCRoadmaps = await prisma.cCRoadmap.findMany()
    * ```
    */
  get cCRoadmap(): Prisma.CCRoadmapDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    CCUser: 'CCUser',
    CCWizardAnswers: 'CCWizardAnswers',
    CCRoadmap: 'CCRoadmap'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "cCUser" | "cCWizardAnswers" | "cCRoadmap"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      CCUser: {
        payload: Prisma.$CCUserPayload<ExtArgs>
        fields: Prisma.CCUserFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CCUserFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CCUserFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>
          }
          findFirst: {
            args: Prisma.CCUserFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CCUserFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>
          }
          findMany: {
            args: Prisma.CCUserFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>[]
          }
          create: {
            args: Prisma.CCUserCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>
          }
          createMany: {
            args: Prisma.CCUserCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CCUserCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>[]
          }
          delete: {
            args: Prisma.CCUserDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>
          }
          update: {
            args: Prisma.CCUserUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>
          }
          deleteMany: {
            args: Prisma.CCUserDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CCUserUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.CCUserUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCUserPayload>
          }
          aggregate: {
            args: Prisma.CCUserAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCCUser>
          }
          groupBy: {
            args: Prisma.CCUserGroupByArgs<ExtArgs>
            result: $Utils.Optional<CCUserGroupByOutputType>[]
          }
          count: {
            args: Prisma.CCUserCountArgs<ExtArgs>
            result: $Utils.Optional<CCUserCountAggregateOutputType> | number
          }
        }
      }
      CCWizardAnswers: {
        payload: Prisma.$CCWizardAnswersPayload<ExtArgs>
        fields: Prisma.CCWizardAnswersFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CCWizardAnswersFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CCWizardAnswersFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>
          }
          findFirst: {
            args: Prisma.CCWizardAnswersFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CCWizardAnswersFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>
          }
          findMany: {
            args: Prisma.CCWizardAnswersFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>[]
          }
          create: {
            args: Prisma.CCWizardAnswersCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>
          }
          createMany: {
            args: Prisma.CCWizardAnswersCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CCWizardAnswersCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>[]
          }
          delete: {
            args: Prisma.CCWizardAnswersDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>
          }
          update: {
            args: Prisma.CCWizardAnswersUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>
          }
          deleteMany: {
            args: Prisma.CCWizardAnswersDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CCWizardAnswersUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.CCWizardAnswersUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCWizardAnswersPayload>
          }
          aggregate: {
            args: Prisma.CCWizardAnswersAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCCWizardAnswers>
          }
          groupBy: {
            args: Prisma.CCWizardAnswersGroupByArgs<ExtArgs>
            result: $Utils.Optional<CCWizardAnswersGroupByOutputType>[]
          }
          count: {
            args: Prisma.CCWizardAnswersCountArgs<ExtArgs>
            result: $Utils.Optional<CCWizardAnswersCountAggregateOutputType> | number
          }
        }
      }
      CCRoadmap: {
        payload: Prisma.$CCRoadmapPayload<ExtArgs>
        fields: Prisma.CCRoadmapFieldRefs
        operations: {
          findUnique: {
            args: Prisma.CCRoadmapFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.CCRoadmapFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>
          }
          findFirst: {
            args: Prisma.CCRoadmapFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.CCRoadmapFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>
          }
          findMany: {
            args: Prisma.CCRoadmapFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>[]
          }
          create: {
            args: Prisma.CCRoadmapCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>
          }
          createMany: {
            args: Prisma.CCRoadmapCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.CCRoadmapCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>[]
          }
          delete: {
            args: Prisma.CCRoadmapDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>
          }
          update: {
            args: Prisma.CCRoadmapUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>
          }
          deleteMany: {
            args: Prisma.CCRoadmapDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.CCRoadmapUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.CCRoadmapUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$CCRoadmapPayload>
          }
          aggregate: {
            args: Prisma.CCRoadmapAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateCCRoadmap>
          }
          groupBy: {
            args: Prisma.CCRoadmapGroupByArgs<ExtArgs>
            result: $Utils.Optional<CCRoadmapGroupByOutputType>[]
          }
          count: {
            args: Prisma.CCRoadmapCountArgs<ExtArgs>
            result: $Utils.Optional<CCRoadmapCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type CCUserCountOutputType
   */

  export type CCUserCountOutputType = {
    roadmaps: number
  }

  export type CCUserCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    roadmaps?: boolean | CCUserCountOutputTypeCountRoadmapsArgs
  }

  // Custom InputTypes
  /**
   * CCUserCountOutputType without action
   */
  export type CCUserCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUserCountOutputType
     */
    select?: CCUserCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * CCUserCountOutputType without action
   */
  export type CCUserCountOutputTypeCountRoadmapsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CCRoadmapWhereInput
  }


  /**
   * Models
   */

  /**
   * Model CCUser
   */

  export type AggregateCCUser = {
    _count: CCUserCountAggregateOutputType | null
    _min: CCUserMinAggregateOutputType | null
    _max: CCUserMaxAggregateOutputType | null
  }

  export type CCUserMinAggregateOutputType = {
    id: string | null
    name: string | null
    email: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CCUserMaxAggregateOutputType = {
    id: string | null
    name: string | null
    email: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type CCUserCountAggregateOutputType = {
    id: number
    name: number
    email: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type CCUserMinAggregateInputType = {
    id?: true
    name?: true
    email?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CCUserMaxAggregateInputType = {
    id?: true
    name?: true
    email?: true
    createdAt?: true
    updatedAt?: true
  }

  export type CCUserCountAggregateInputType = {
    id?: true
    name?: true
    email?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type CCUserAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CCUser to aggregate.
     */
    where?: CCUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCUsers to fetch.
     */
    orderBy?: CCUserOrderByWithRelationInput | CCUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CCUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CCUsers
    **/
    _count?: true | CCUserCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CCUserMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CCUserMaxAggregateInputType
  }

  export type GetCCUserAggregateType<T extends CCUserAggregateArgs> = {
        [P in keyof T & keyof AggregateCCUser]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCCUser[P]>
      : GetScalarType<T[P], AggregateCCUser[P]>
  }




  export type CCUserGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CCUserWhereInput
    orderBy?: CCUserOrderByWithAggregationInput | CCUserOrderByWithAggregationInput[]
    by: CCUserScalarFieldEnum[] | CCUserScalarFieldEnum
    having?: CCUserScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CCUserCountAggregateInputType | true
    _min?: CCUserMinAggregateInputType
    _max?: CCUserMaxAggregateInputType
  }

  export type CCUserGroupByOutputType = {
    id: string
    name: string
    email: string
    createdAt: Date
    updatedAt: Date
    _count: CCUserCountAggregateOutputType | null
    _min: CCUserMinAggregateOutputType | null
    _max: CCUserMaxAggregateOutputType | null
  }

  type GetCCUserGroupByPayload<T extends CCUserGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CCUserGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CCUserGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CCUserGroupByOutputType[P]>
            : GetScalarType<T[P], CCUserGroupByOutputType[P]>
        }
      >
    >


  export type CCUserSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    wizardAnswers?: boolean | CCUser$wizardAnswersArgs<ExtArgs>
    roadmaps?: boolean | CCUser$roadmapsArgs<ExtArgs>
    _count?: boolean | CCUserCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["cCUser"]>

  export type CCUserSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    email?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["cCUser"]>

  export type CCUserSelectScalar = {
    id?: boolean
    name?: boolean
    email?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type CCUserInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    wizardAnswers?: boolean | CCUser$wizardAnswersArgs<ExtArgs>
    roadmaps?: boolean | CCUser$roadmapsArgs<ExtArgs>
    _count?: boolean | CCUserCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type CCUserIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $CCUserPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CCUser"
    objects: {
      wizardAnswers: Prisma.$CCWizardAnswersPayload<ExtArgs> | null
      roadmaps: Prisma.$CCRoadmapPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      email: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["cCUser"]>
    composites: {}
  }

  type CCUserGetPayload<S extends boolean | null | undefined | CCUserDefaultArgs> = $Result.GetResult<Prisma.$CCUserPayload, S>

  type CCUserCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<CCUserFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: CCUserCountAggregateInputType | true
    }

  export interface CCUserDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CCUser'], meta: { name: 'CCUser' } }
    /**
     * Find zero or one CCUser that matches the filter.
     * @param {CCUserFindUniqueArgs} args - Arguments to find a CCUser
     * @example
     * // Get one CCUser
     * const cCUser = await prisma.cCUser.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CCUserFindUniqueArgs>(args: SelectSubset<T, CCUserFindUniqueArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one CCUser that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {CCUserFindUniqueOrThrowArgs} args - Arguments to find a CCUser
     * @example
     * // Get one CCUser
     * const cCUser = await prisma.cCUser.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CCUserFindUniqueOrThrowArgs>(args: SelectSubset<T, CCUserFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first CCUser that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserFindFirstArgs} args - Arguments to find a CCUser
     * @example
     * // Get one CCUser
     * const cCUser = await prisma.cCUser.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CCUserFindFirstArgs>(args?: SelectSubset<T, CCUserFindFirstArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first CCUser that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserFindFirstOrThrowArgs} args - Arguments to find a CCUser
     * @example
     * // Get one CCUser
     * const cCUser = await prisma.cCUser.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CCUserFindFirstOrThrowArgs>(args?: SelectSubset<T, CCUserFindFirstOrThrowArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more CCUsers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CCUsers
     * const cCUsers = await prisma.cCUser.findMany()
     * 
     * // Get first 10 CCUsers
     * const cCUsers = await prisma.cCUser.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const cCUserWithIdOnly = await prisma.cCUser.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CCUserFindManyArgs>(args?: SelectSubset<T, CCUserFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a CCUser.
     * @param {CCUserCreateArgs} args - Arguments to create a CCUser.
     * @example
     * // Create one CCUser
     * const CCUser = await prisma.cCUser.create({
     *   data: {
     *     // ... data to create a CCUser
     *   }
     * })
     * 
     */
    create<T extends CCUserCreateArgs>(args: SelectSubset<T, CCUserCreateArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many CCUsers.
     * @param {CCUserCreateManyArgs} args - Arguments to create many CCUsers.
     * @example
     * // Create many CCUsers
     * const cCUser = await prisma.cCUser.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CCUserCreateManyArgs>(args?: SelectSubset<T, CCUserCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CCUsers and returns the data saved in the database.
     * @param {CCUserCreateManyAndReturnArgs} args - Arguments to create many CCUsers.
     * @example
     * // Create many CCUsers
     * const cCUser = await prisma.cCUser.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CCUsers and only return the `id`
     * const cCUserWithIdOnly = await prisma.cCUser.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CCUserCreateManyAndReturnArgs>(args?: SelectSubset<T, CCUserCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a CCUser.
     * @param {CCUserDeleteArgs} args - Arguments to delete one CCUser.
     * @example
     * // Delete one CCUser
     * const CCUser = await prisma.cCUser.delete({
     *   where: {
     *     // ... filter to delete one CCUser
     *   }
     * })
     * 
     */
    delete<T extends CCUserDeleteArgs>(args: SelectSubset<T, CCUserDeleteArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one CCUser.
     * @param {CCUserUpdateArgs} args - Arguments to update one CCUser.
     * @example
     * // Update one CCUser
     * const cCUser = await prisma.cCUser.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CCUserUpdateArgs>(args: SelectSubset<T, CCUserUpdateArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more CCUsers.
     * @param {CCUserDeleteManyArgs} args - Arguments to filter CCUsers to delete.
     * @example
     * // Delete a few CCUsers
     * const { count } = await prisma.cCUser.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CCUserDeleteManyArgs>(args?: SelectSubset<T, CCUserDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CCUsers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CCUsers
     * const cCUser = await prisma.cCUser.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CCUserUpdateManyArgs>(args: SelectSubset<T, CCUserUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one CCUser.
     * @param {CCUserUpsertArgs} args - Arguments to update or create a CCUser.
     * @example
     * // Update or create a CCUser
     * const cCUser = await prisma.cCUser.upsert({
     *   create: {
     *     // ... data to create a CCUser
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CCUser we want to update
     *   }
     * })
     */
    upsert<T extends CCUserUpsertArgs>(args: SelectSubset<T, CCUserUpsertArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of CCUsers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserCountArgs} args - Arguments to filter CCUsers to count.
     * @example
     * // Count the number of CCUsers
     * const count = await prisma.cCUser.count({
     *   where: {
     *     // ... the filter for the CCUsers we want to count
     *   }
     * })
    **/
    count<T extends CCUserCountArgs>(
      args?: Subset<T, CCUserCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CCUserCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CCUser.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CCUserAggregateArgs>(args: Subset<T, CCUserAggregateArgs>): Prisma.PrismaPromise<GetCCUserAggregateType<T>>

    /**
     * Group by CCUser.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCUserGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CCUserGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CCUserGroupByArgs['orderBy'] }
        : { orderBy?: CCUserGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CCUserGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCCUserGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CCUser model
   */
  readonly fields: CCUserFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CCUser.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CCUserClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    wizardAnswers<T extends CCUser$wizardAnswersArgs<ExtArgs> = {}>(args?: Subset<T, CCUser$wizardAnswersArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
    roadmaps<T extends CCUser$roadmapsArgs<ExtArgs> = {}>(args?: Subset<T, CCUser$roadmapsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "findMany"> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CCUser model
   */ 
  interface CCUserFieldRefs {
    readonly id: FieldRef<"CCUser", 'String'>
    readonly name: FieldRef<"CCUser", 'String'>
    readonly email: FieldRef<"CCUser", 'String'>
    readonly createdAt: FieldRef<"CCUser", 'DateTime'>
    readonly updatedAt: FieldRef<"CCUser", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CCUser findUnique
   */
  export type CCUserFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * Filter, which CCUser to fetch.
     */
    where: CCUserWhereUniqueInput
  }

  /**
   * CCUser findUniqueOrThrow
   */
  export type CCUserFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * Filter, which CCUser to fetch.
     */
    where: CCUserWhereUniqueInput
  }

  /**
   * CCUser findFirst
   */
  export type CCUserFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * Filter, which CCUser to fetch.
     */
    where?: CCUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCUsers to fetch.
     */
    orderBy?: CCUserOrderByWithRelationInput | CCUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CCUsers.
     */
    cursor?: CCUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CCUsers.
     */
    distinct?: CCUserScalarFieldEnum | CCUserScalarFieldEnum[]
  }

  /**
   * CCUser findFirstOrThrow
   */
  export type CCUserFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * Filter, which CCUser to fetch.
     */
    where?: CCUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCUsers to fetch.
     */
    orderBy?: CCUserOrderByWithRelationInput | CCUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CCUsers.
     */
    cursor?: CCUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCUsers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CCUsers.
     */
    distinct?: CCUserScalarFieldEnum | CCUserScalarFieldEnum[]
  }

  /**
   * CCUser findMany
   */
  export type CCUserFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * Filter, which CCUsers to fetch.
     */
    where?: CCUserWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCUsers to fetch.
     */
    orderBy?: CCUserOrderByWithRelationInput | CCUserOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CCUsers.
     */
    cursor?: CCUserWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCUsers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCUsers.
     */
    skip?: number
    distinct?: CCUserScalarFieldEnum | CCUserScalarFieldEnum[]
  }

  /**
   * CCUser create
   */
  export type CCUserCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * The data needed to create a CCUser.
     */
    data: XOR<CCUserCreateInput, CCUserUncheckedCreateInput>
  }

  /**
   * CCUser createMany
   */
  export type CCUserCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CCUsers.
     */
    data: CCUserCreateManyInput | CCUserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CCUser createManyAndReturn
   */
  export type CCUserCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many CCUsers.
     */
    data: CCUserCreateManyInput | CCUserCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CCUser update
   */
  export type CCUserUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * The data needed to update a CCUser.
     */
    data: XOR<CCUserUpdateInput, CCUserUncheckedUpdateInput>
    /**
     * Choose, which CCUser to update.
     */
    where: CCUserWhereUniqueInput
  }

  /**
   * CCUser updateMany
   */
  export type CCUserUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CCUsers.
     */
    data: XOR<CCUserUpdateManyMutationInput, CCUserUncheckedUpdateManyInput>
    /**
     * Filter which CCUsers to update
     */
    where?: CCUserWhereInput
  }

  /**
   * CCUser upsert
   */
  export type CCUserUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * The filter to search for the CCUser to update in case it exists.
     */
    where: CCUserWhereUniqueInput
    /**
     * In case the CCUser found by the `where` argument doesn't exist, create a new CCUser with this data.
     */
    create: XOR<CCUserCreateInput, CCUserUncheckedCreateInput>
    /**
     * In case the CCUser was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CCUserUpdateInput, CCUserUncheckedUpdateInput>
  }

  /**
   * CCUser delete
   */
  export type CCUserDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
    /**
     * Filter which CCUser to delete.
     */
    where: CCUserWhereUniqueInput
  }

  /**
   * CCUser deleteMany
   */
  export type CCUserDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CCUsers to delete
     */
    where?: CCUserWhereInput
  }

  /**
   * CCUser.wizardAnswers
   */
  export type CCUser$wizardAnswersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    where?: CCWizardAnswersWhereInput
  }

  /**
   * CCUser.roadmaps
   */
  export type CCUser$roadmapsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    where?: CCRoadmapWhereInput
    orderBy?: CCRoadmapOrderByWithRelationInput | CCRoadmapOrderByWithRelationInput[]
    cursor?: CCRoadmapWhereUniqueInput
    take?: number
    skip?: number
    distinct?: CCRoadmapScalarFieldEnum | CCRoadmapScalarFieldEnum[]
  }

  /**
   * CCUser without action
   */
  export type CCUserDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCUser
     */
    select?: CCUserSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCUserInclude<ExtArgs> | null
  }


  /**
   * Model CCWizardAnswers
   */

  export type AggregateCCWizardAnswers = {
    _count: CCWizardAnswersCountAggregateOutputType | null
    _min: CCWizardAnswersMinAggregateOutputType | null
    _max: CCWizardAnswersMaxAggregateOutputType | null
  }

  export type CCWizardAnswersMinAggregateOutputType = {
    id: string | null
    userId: string | null
    school: string | null
    major: string | null
    year: string | null
    coursework: string | null
    interests: string | null
    resumeText: string | null
    linkedinText: string | null
    targetRoles: string | null
    scenarioNotes: string | null
    updatedAt: Date | null
  }

  export type CCWizardAnswersMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    school: string | null
    major: string | null
    year: string | null
    coursework: string | null
    interests: string | null
    resumeText: string | null
    linkedinText: string | null
    targetRoles: string | null
    scenarioNotes: string | null
    updatedAt: Date | null
  }

  export type CCWizardAnswersCountAggregateOutputType = {
    id: number
    userId: number
    school: number
    major: number
    year: number
    coursework: number
    interests: number
    resumeText: number
    linkedinText: number
    targetRoles: number
    scenarioNotes: number
    updatedAt: number
    _all: number
  }


  export type CCWizardAnswersMinAggregateInputType = {
    id?: true
    userId?: true
    school?: true
    major?: true
    year?: true
    coursework?: true
    interests?: true
    resumeText?: true
    linkedinText?: true
    targetRoles?: true
    scenarioNotes?: true
    updatedAt?: true
  }

  export type CCWizardAnswersMaxAggregateInputType = {
    id?: true
    userId?: true
    school?: true
    major?: true
    year?: true
    coursework?: true
    interests?: true
    resumeText?: true
    linkedinText?: true
    targetRoles?: true
    scenarioNotes?: true
    updatedAt?: true
  }

  export type CCWizardAnswersCountAggregateInputType = {
    id?: true
    userId?: true
    school?: true
    major?: true
    year?: true
    coursework?: true
    interests?: true
    resumeText?: true
    linkedinText?: true
    targetRoles?: true
    scenarioNotes?: true
    updatedAt?: true
    _all?: true
  }

  export type CCWizardAnswersAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CCWizardAnswers to aggregate.
     */
    where?: CCWizardAnswersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCWizardAnswers to fetch.
     */
    orderBy?: CCWizardAnswersOrderByWithRelationInput | CCWizardAnswersOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CCWizardAnswersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCWizardAnswers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCWizardAnswers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CCWizardAnswers
    **/
    _count?: true | CCWizardAnswersCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CCWizardAnswersMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CCWizardAnswersMaxAggregateInputType
  }

  export type GetCCWizardAnswersAggregateType<T extends CCWizardAnswersAggregateArgs> = {
        [P in keyof T & keyof AggregateCCWizardAnswers]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCCWizardAnswers[P]>
      : GetScalarType<T[P], AggregateCCWizardAnswers[P]>
  }




  export type CCWizardAnswersGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CCWizardAnswersWhereInput
    orderBy?: CCWizardAnswersOrderByWithAggregationInput | CCWizardAnswersOrderByWithAggregationInput[]
    by: CCWizardAnswersScalarFieldEnum[] | CCWizardAnswersScalarFieldEnum
    having?: CCWizardAnswersScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CCWizardAnswersCountAggregateInputType | true
    _min?: CCWizardAnswersMinAggregateInputType
    _max?: CCWizardAnswersMaxAggregateInputType
  }

  export type CCWizardAnswersGroupByOutputType = {
    id: string
    userId: string
    school: string
    major: string
    year: string
    coursework: string
    interests: string
    resumeText: string
    linkedinText: string
    targetRoles: string
    scenarioNotes: string
    updatedAt: Date
    _count: CCWizardAnswersCountAggregateOutputType | null
    _min: CCWizardAnswersMinAggregateOutputType | null
    _max: CCWizardAnswersMaxAggregateOutputType | null
  }

  type GetCCWizardAnswersGroupByPayload<T extends CCWizardAnswersGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CCWizardAnswersGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CCWizardAnswersGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CCWizardAnswersGroupByOutputType[P]>
            : GetScalarType<T[P], CCWizardAnswersGroupByOutputType[P]>
        }
      >
    >


  export type CCWizardAnswersSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    school?: boolean
    major?: boolean
    year?: boolean
    coursework?: boolean
    interests?: boolean
    resumeText?: boolean
    linkedinText?: boolean
    targetRoles?: boolean
    scenarioNotes?: boolean
    updatedAt?: boolean
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["cCWizardAnswers"]>

  export type CCWizardAnswersSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    school?: boolean
    major?: boolean
    year?: boolean
    coursework?: boolean
    interests?: boolean
    resumeText?: boolean
    linkedinText?: boolean
    targetRoles?: boolean
    scenarioNotes?: boolean
    updatedAt?: boolean
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["cCWizardAnswers"]>

  export type CCWizardAnswersSelectScalar = {
    id?: boolean
    userId?: boolean
    school?: boolean
    major?: boolean
    year?: boolean
    coursework?: boolean
    interests?: boolean
    resumeText?: boolean
    linkedinText?: boolean
    targetRoles?: boolean
    scenarioNotes?: boolean
    updatedAt?: boolean
  }

  export type CCWizardAnswersInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }
  export type CCWizardAnswersIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }

  export type $CCWizardAnswersPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CCWizardAnswers"
    objects: {
      user: Prisma.$CCUserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      school: string
      major: string
      year: string
      coursework: string
      interests: string
      resumeText: string
      linkedinText: string
      targetRoles: string
      scenarioNotes: string
      updatedAt: Date
    }, ExtArgs["result"]["cCWizardAnswers"]>
    composites: {}
  }

  type CCWizardAnswersGetPayload<S extends boolean | null | undefined | CCWizardAnswersDefaultArgs> = $Result.GetResult<Prisma.$CCWizardAnswersPayload, S>

  type CCWizardAnswersCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<CCWizardAnswersFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: CCWizardAnswersCountAggregateInputType | true
    }

  export interface CCWizardAnswersDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CCWizardAnswers'], meta: { name: 'CCWizardAnswers' } }
    /**
     * Find zero or one CCWizardAnswers that matches the filter.
     * @param {CCWizardAnswersFindUniqueArgs} args - Arguments to find a CCWizardAnswers
     * @example
     * // Get one CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CCWizardAnswersFindUniqueArgs>(args: SelectSubset<T, CCWizardAnswersFindUniqueArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one CCWizardAnswers that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {CCWizardAnswersFindUniqueOrThrowArgs} args - Arguments to find a CCWizardAnswers
     * @example
     * // Get one CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CCWizardAnswersFindUniqueOrThrowArgs>(args: SelectSubset<T, CCWizardAnswersFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first CCWizardAnswers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersFindFirstArgs} args - Arguments to find a CCWizardAnswers
     * @example
     * // Get one CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CCWizardAnswersFindFirstArgs>(args?: SelectSubset<T, CCWizardAnswersFindFirstArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first CCWizardAnswers that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersFindFirstOrThrowArgs} args - Arguments to find a CCWizardAnswers
     * @example
     * // Get one CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CCWizardAnswersFindFirstOrThrowArgs>(args?: SelectSubset<T, CCWizardAnswersFindFirstOrThrowArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more CCWizardAnswers that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.findMany()
     * 
     * // Get first 10 CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const cCWizardAnswersWithIdOnly = await prisma.cCWizardAnswers.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CCWizardAnswersFindManyArgs>(args?: SelectSubset<T, CCWizardAnswersFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a CCWizardAnswers.
     * @param {CCWizardAnswersCreateArgs} args - Arguments to create a CCWizardAnswers.
     * @example
     * // Create one CCWizardAnswers
     * const CCWizardAnswers = await prisma.cCWizardAnswers.create({
     *   data: {
     *     // ... data to create a CCWizardAnswers
     *   }
     * })
     * 
     */
    create<T extends CCWizardAnswersCreateArgs>(args: SelectSubset<T, CCWizardAnswersCreateArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many CCWizardAnswers.
     * @param {CCWizardAnswersCreateManyArgs} args - Arguments to create many CCWizardAnswers.
     * @example
     * // Create many CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CCWizardAnswersCreateManyArgs>(args?: SelectSubset<T, CCWizardAnswersCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CCWizardAnswers and returns the data saved in the database.
     * @param {CCWizardAnswersCreateManyAndReturnArgs} args - Arguments to create many CCWizardAnswers.
     * @example
     * // Create many CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CCWizardAnswers and only return the `id`
     * const cCWizardAnswersWithIdOnly = await prisma.cCWizardAnswers.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CCWizardAnswersCreateManyAndReturnArgs>(args?: SelectSubset<T, CCWizardAnswersCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a CCWizardAnswers.
     * @param {CCWizardAnswersDeleteArgs} args - Arguments to delete one CCWizardAnswers.
     * @example
     * // Delete one CCWizardAnswers
     * const CCWizardAnswers = await prisma.cCWizardAnswers.delete({
     *   where: {
     *     // ... filter to delete one CCWizardAnswers
     *   }
     * })
     * 
     */
    delete<T extends CCWizardAnswersDeleteArgs>(args: SelectSubset<T, CCWizardAnswersDeleteArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one CCWizardAnswers.
     * @param {CCWizardAnswersUpdateArgs} args - Arguments to update one CCWizardAnswers.
     * @example
     * // Update one CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CCWizardAnswersUpdateArgs>(args: SelectSubset<T, CCWizardAnswersUpdateArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more CCWizardAnswers.
     * @param {CCWizardAnswersDeleteManyArgs} args - Arguments to filter CCWizardAnswers to delete.
     * @example
     * // Delete a few CCWizardAnswers
     * const { count } = await prisma.cCWizardAnswers.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CCWizardAnswersDeleteManyArgs>(args?: SelectSubset<T, CCWizardAnswersDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CCWizardAnswers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CCWizardAnswersUpdateManyArgs>(args: SelectSubset<T, CCWizardAnswersUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one CCWizardAnswers.
     * @param {CCWizardAnswersUpsertArgs} args - Arguments to update or create a CCWizardAnswers.
     * @example
     * // Update or create a CCWizardAnswers
     * const cCWizardAnswers = await prisma.cCWizardAnswers.upsert({
     *   create: {
     *     // ... data to create a CCWizardAnswers
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CCWizardAnswers we want to update
     *   }
     * })
     */
    upsert<T extends CCWizardAnswersUpsertArgs>(args: SelectSubset<T, CCWizardAnswersUpsertArgs<ExtArgs>>): Prisma__CCWizardAnswersClient<$Result.GetResult<Prisma.$CCWizardAnswersPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of CCWizardAnswers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersCountArgs} args - Arguments to filter CCWizardAnswers to count.
     * @example
     * // Count the number of CCWizardAnswers
     * const count = await prisma.cCWizardAnswers.count({
     *   where: {
     *     // ... the filter for the CCWizardAnswers we want to count
     *   }
     * })
    **/
    count<T extends CCWizardAnswersCountArgs>(
      args?: Subset<T, CCWizardAnswersCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CCWizardAnswersCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CCWizardAnswers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CCWizardAnswersAggregateArgs>(args: Subset<T, CCWizardAnswersAggregateArgs>): Prisma.PrismaPromise<GetCCWizardAnswersAggregateType<T>>

    /**
     * Group by CCWizardAnswers.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCWizardAnswersGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CCWizardAnswersGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CCWizardAnswersGroupByArgs['orderBy'] }
        : { orderBy?: CCWizardAnswersGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CCWizardAnswersGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCCWizardAnswersGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CCWizardAnswers model
   */
  readonly fields: CCWizardAnswersFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CCWizardAnswers.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CCWizardAnswersClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends CCUserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, CCUserDefaultArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CCWizardAnswers model
   */ 
  interface CCWizardAnswersFieldRefs {
    readonly id: FieldRef<"CCWizardAnswers", 'String'>
    readonly userId: FieldRef<"CCWizardAnswers", 'String'>
    readonly school: FieldRef<"CCWizardAnswers", 'String'>
    readonly major: FieldRef<"CCWizardAnswers", 'String'>
    readonly year: FieldRef<"CCWizardAnswers", 'String'>
    readonly coursework: FieldRef<"CCWizardAnswers", 'String'>
    readonly interests: FieldRef<"CCWizardAnswers", 'String'>
    readonly resumeText: FieldRef<"CCWizardAnswers", 'String'>
    readonly linkedinText: FieldRef<"CCWizardAnswers", 'String'>
    readonly targetRoles: FieldRef<"CCWizardAnswers", 'String'>
    readonly scenarioNotes: FieldRef<"CCWizardAnswers", 'String'>
    readonly updatedAt: FieldRef<"CCWizardAnswers", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CCWizardAnswers findUnique
   */
  export type CCWizardAnswersFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * Filter, which CCWizardAnswers to fetch.
     */
    where: CCWizardAnswersWhereUniqueInput
  }

  /**
   * CCWizardAnswers findUniqueOrThrow
   */
  export type CCWizardAnswersFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * Filter, which CCWizardAnswers to fetch.
     */
    where: CCWizardAnswersWhereUniqueInput
  }

  /**
   * CCWizardAnswers findFirst
   */
  export type CCWizardAnswersFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * Filter, which CCWizardAnswers to fetch.
     */
    where?: CCWizardAnswersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCWizardAnswers to fetch.
     */
    orderBy?: CCWizardAnswersOrderByWithRelationInput | CCWizardAnswersOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CCWizardAnswers.
     */
    cursor?: CCWizardAnswersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCWizardAnswers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCWizardAnswers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CCWizardAnswers.
     */
    distinct?: CCWizardAnswersScalarFieldEnum | CCWizardAnswersScalarFieldEnum[]
  }

  /**
   * CCWizardAnswers findFirstOrThrow
   */
  export type CCWizardAnswersFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * Filter, which CCWizardAnswers to fetch.
     */
    where?: CCWizardAnswersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCWizardAnswers to fetch.
     */
    orderBy?: CCWizardAnswersOrderByWithRelationInput | CCWizardAnswersOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CCWizardAnswers.
     */
    cursor?: CCWizardAnswersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCWizardAnswers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCWizardAnswers.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CCWizardAnswers.
     */
    distinct?: CCWizardAnswersScalarFieldEnum | CCWizardAnswersScalarFieldEnum[]
  }

  /**
   * CCWizardAnswers findMany
   */
  export type CCWizardAnswersFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * Filter, which CCWizardAnswers to fetch.
     */
    where?: CCWizardAnswersWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCWizardAnswers to fetch.
     */
    orderBy?: CCWizardAnswersOrderByWithRelationInput | CCWizardAnswersOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CCWizardAnswers.
     */
    cursor?: CCWizardAnswersWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCWizardAnswers from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCWizardAnswers.
     */
    skip?: number
    distinct?: CCWizardAnswersScalarFieldEnum | CCWizardAnswersScalarFieldEnum[]
  }

  /**
   * CCWizardAnswers create
   */
  export type CCWizardAnswersCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * The data needed to create a CCWizardAnswers.
     */
    data: XOR<CCWizardAnswersCreateInput, CCWizardAnswersUncheckedCreateInput>
  }

  /**
   * CCWizardAnswers createMany
   */
  export type CCWizardAnswersCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CCWizardAnswers.
     */
    data: CCWizardAnswersCreateManyInput | CCWizardAnswersCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CCWizardAnswers createManyAndReturn
   */
  export type CCWizardAnswersCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many CCWizardAnswers.
     */
    data: CCWizardAnswersCreateManyInput | CCWizardAnswersCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * CCWizardAnswers update
   */
  export type CCWizardAnswersUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * The data needed to update a CCWizardAnswers.
     */
    data: XOR<CCWizardAnswersUpdateInput, CCWizardAnswersUncheckedUpdateInput>
    /**
     * Choose, which CCWizardAnswers to update.
     */
    where: CCWizardAnswersWhereUniqueInput
  }

  /**
   * CCWizardAnswers updateMany
   */
  export type CCWizardAnswersUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CCWizardAnswers.
     */
    data: XOR<CCWizardAnswersUpdateManyMutationInput, CCWizardAnswersUncheckedUpdateManyInput>
    /**
     * Filter which CCWizardAnswers to update
     */
    where?: CCWizardAnswersWhereInput
  }

  /**
   * CCWizardAnswers upsert
   */
  export type CCWizardAnswersUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * The filter to search for the CCWizardAnswers to update in case it exists.
     */
    where: CCWizardAnswersWhereUniqueInput
    /**
     * In case the CCWizardAnswers found by the `where` argument doesn't exist, create a new CCWizardAnswers with this data.
     */
    create: XOR<CCWizardAnswersCreateInput, CCWizardAnswersUncheckedCreateInput>
    /**
     * In case the CCWizardAnswers was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CCWizardAnswersUpdateInput, CCWizardAnswersUncheckedUpdateInput>
  }

  /**
   * CCWizardAnswers delete
   */
  export type CCWizardAnswersDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
    /**
     * Filter which CCWizardAnswers to delete.
     */
    where: CCWizardAnswersWhereUniqueInput
  }

  /**
   * CCWizardAnswers deleteMany
   */
  export type CCWizardAnswersDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CCWizardAnswers to delete
     */
    where?: CCWizardAnswersWhereInput
  }

  /**
   * CCWizardAnswers without action
   */
  export type CCWizardAnswersDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCWizardAnswers
     */
    select?: CCWizardAnswersSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCWizardAnswersInclude<ExtArgs> | null
  }


  /**
   * Model CCRoadmap
   */

  export type AggregateCCRoadmap = {
    _count: CCRoadmapCountAggregateOutputType | null
    _min: CCRoadmapMinAggregateOutputType | null
    _max: CCRoadmapMaxAggregateOutputType | null
  }

  export type CCRoadmapMinAggregateOutputType = {
    id: string | null
    userId: string | null
    markdown: string | null
    generatedAt: Date | null
  }

  export type CCRoadmapMaxAggregateOutputType = {
    id: string | null
    userId: string | null
    markdown: string | null
    generatedAt: Date | null
  }

  export type CCRoadmapCountAggregateOutputType = {
    id: number
    userId: number
    markdown: number
    generatedAt: number
    _all: number
  }


  export type CCRoadmapMinAggregateInputType = {
    id?: true
    userId?: true
    markdown?: true
    generatedAt?: true
  }

  export type CCRoadmapMaxAggregateInputType = {
    id?: true
    userId?: true
    markdown?: true
    generatedAt?: true
  }

  export type CCRoadmapCountAggregateInputType = {
    id?: true
    userId?: true
    markdown?: true
    generatedAt?: true
    _all?: true
  }

  export type CCRoadmapAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CCRoadmap to aggregate.
     */
    where?: CCRoadmapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCRoadmaps to fetch.
     */
    orderBy?: CCRoadmapOrderByWithRelationInput | CCRoadmapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: CCRoadmapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCRoadmaps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCRoadmaps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned CCRoadmaps
    **/
    _count?: true | CCRoadmapCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: CCRoadmapMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: CCRoadmapMaxAggregateInputType
  }

  export type GetCCRoadmapAggregateType<T extends CCRoadmapAggregateArgs> = {
        [P in keyof T & keyof AggregateCCRoadmap]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateCCRoadmap[P]>
      : GetScalarType<T[P], AggregateCCRoadmap[P]>
  }




  export type CCRoadmapGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: CCRoadmapWhereInput
    orderBy?: CCRoadmapOrderByWithAggregationInput | CCRoadmapOrderByWithAggregationInput[]
    by: CCRoadmapScalarFieldEnum[] | CCRoadmapScalarFieldEnum
    having?: CCRoadmapScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: CCRoadmapCountAggregateInputType | true
    _min?: CCRoadmapMinAggregateInputType
    _max?: CCRoadmapMaxAggregateInputType
  }

  export type CCRoadmapGroupByOutputType = {
    id: string
    userId: string
    markdown: string
    generatedAt: Date
    _count: CCRoadmapCountAggregateOutputType | null
    _min: CCRoadmapMinAggregateOutputType | null
    _max: CCRoadmapMaxAggregateOutputType | null
  }

  type GetCCRoadmapGroupByPayload<T extends CCRoadmapGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<CCRoadmapGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof CCRoadmapGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], CCRoadmapGroupByOutputType[P]>
            : GetScalarType<T[P], CCRoadmapGroupByOutputType[P]>
        }
      >
    >


  export type CCRoadmapSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    markdown?: boolean
    generatedAt?: boolean
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["cCRoadmap"]>

  export type CCRoadmapSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    userId?: boolean
    markdown?: boolean
    generatedAt?: boolean
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["cCRoadmap"]>

  export type CCRoadmapSelectScalar = {
    id?: boolean
    userId?: boolean
    markdown?: boolean
    generatedAt?: boolean
  }

  export type CCRoadmapInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }
  export type CCRoadmapIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    user?: boolean | CCUserDefaultArgs<ExtArgs>
  }

  export type $CCRoadmapPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "CCRoadmap"
    objects: {
      user: Prisma.$CCUserPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      userId: string
      markdown: string
      generatedAt: Date
    }, ExtArgs["result"]["cCRoadmap"]>
    composites: {}
  }

  type CCRoadmapGetPayload<S extends boolean | null | undefined | CCRoadmapDefaultArgs> = $Result.GetResult<Prisma.$CCRoadmapPayload, S>

  type CCRoadmapCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<CCRoadmapFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: CCRoadmapCountAggregateInputType | true
    }

  export interface CCRoadmapDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['CCRoadmap'], meta: { name: 'CCRoadmap' } }
    /**
     * Find zero or one CCRoadmap that matches the filter.
     * @param {CCRoadmapFindUniqueArgs} args - Arguments to find a CCRoadmap
     * @example
     * // Get one CCRoadmap
     * const cCRoadmap = await prisma.cCRoadmap.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends CCRoadmapFindUniqueArgs>(args: SelectSubset<T, CCRoadmapFindUniqueArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one CCRoadmap that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {CCRoadmapFindUniqueOrThrowArgs} args - Arguments to find a CCRoadmap
     * @example
     * // Get one CCRoadmap
     * const cCRoadmap = await prisma.cCRoadmap.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends CCRoadmapFindUniqueOrThrowArgs>(args: SelectSubset<T, CCRoadmapFindUniqueOrThrowArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first CCRoadmap that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapFindFirstArgs} args - Arguments to find a CCRoadmap
     * @example
     * // Get one CCRoadmap
     * const cCRoadmap = await prisma.cCRoadmap.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends CCRoadmapFindFirstArgs>(args?: SelectSubset<T, CCRoadmapFindFirstArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first CCRoadmap that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapFindFirstOrThrowArgs} args - Arguments to find a CCRoadmap
     * @example
     * // Get one CCRoadmap
     * const cCRoadmap = await prisma.cCRoadmap.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends CCRoadmapFindFirstOrThrowArgs>(args?: SelectSubset<T, CCRoadmapFindFirstOrThrowArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more CCRoadmaps that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all CCRoadmaps
     * const cCRoadmaps = await prisma.cCRoadmap.findMany()
     * 
     * // Get first 10 CCRoadmaps
     * const cCRoadmaps = await prisma.cCRoadmap.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const cCRoadmapWithIdOnly = await prisma.cCRoadmap.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends CCRoadmapFindManyArgs>(args?: SelectSubset<T, CCRoadmapFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a CCRoadmap.
     * @param {CCRoadmapCreateArgs} args - Arguments to create a CCRoadmap.
     * @example
     * // Create one CCRoadmap
     * const CCRoadmap = await prisma.cCRoadmap.create({
     *   data: {
     *     // ... data to create a CCRoadmap
     *   }
     * })
     * 
     */
    create<T extends CCRoadmapCreateArgs>(args: SelectSubset<T, CCRoadmapCreateArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many CCRoadmaps.
     * @param {CCRoadmapCreateManyArgs} args - Arguments to create many CCRoadmaps.
     * @example
     * // Create many CCRoadmaps
     * const cCRoadmap = await prisma.cCRoadmap.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends CCRoadmapCreateManyArgs>(args?: SelectSubset<T, CCRoadmapCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many CCRoadmaps and returns the data saved in the database.
     * @param {CCRoadmapCreateManyAndReturnArgs} args - Arguments to create many CCRoadmaps.
     * @example
     * // Create many CCRoadmaps
     * const cCRoadmap = await prisma.cCRoadmap.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many CCRoadmaps and only return the `id`
     * const cCRoadmapWithIdOnly = await prisma.cCRoadmap.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends CCRoadmapCreateManyAndReturnArgs>(args?: SelectSubset<T, CCRoadmapCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a CCRoadmap.
     * @param {CCRoadmapDeleteArgs} args - Arguments to delete one CCRoadmap.
     * @example
     * // Delete one CCRoadmap
     * const CCRoadmap = await prisma.cCRoadmap.delete({
     *   where: {
     *     // ... filter to delete one CCRoadmap
     *   }
     * })
     * 
     */
    delete<T extends CCRoadmapDeleteArgs>(args: SelectSubset<T, CCRoadmapDeleteArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one CCRoadmap.
     * @param {CCRoadmapUpdateArgs} args - Arguments to update one CCRoadmap.
     * @example
     * // Update one CCRoadmap
     * const cCRoadmap = await prisma.cCRoadmap.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends CCRoadmapUpdateArgs>(args: SelectSubset<T, CCRoadmapUpdateArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more CCRoadmaps.
     * @param {CCRoadmapDeleteManyArgs} args - Arguments to filter CCRoadmaps to delete.
     * @example
     * // Delete a few CCRoadmaps
     * const { count } = await prisma.cCRoadmap.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends CCRoadmapDeleteManyArgs>(args?: SelectSubset<T, CCRoadmapDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more CCRoadmaps.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many CCRoadmaps
     * const cCRoadmap = await prisma.cCRoadmap.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends CCRoadmapUpdateManyArgs>(args: SelectSubset<T, CCRoadmapUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one CCRoadmap.
     * @param {CCRoadmapUpsertArgs} args - Arguments to update or create a CCRoadmap.
     * @example
     * // Update or create a CCRoadmap
     * const cCRoadmap = await prisma.cCRoadmap.upsert({
     *   create: {
     *     // ... data to create a CCRoadmap
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the CCRoadmap we want to update
     *   }
     * })
     */
    upsert<T extends CCRoadmapUpsertArgs>(args: SelectSubset<T, CCRoadmapUpsertArgs<ExtArgs>>): Prisma__CCRoadmapClient<$Result.GetResult<Prisma.$CCRoadmapPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of CCRoadmaps.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapCountArgs} args - Arguments to filter CCRoadmaps to count.
     * @example
     * // Count the number of CCRoadmaps
     * const count = await prisma.cCRoadmap.count({
     *   where: {
     *     // ... the filter for the CCRoadmaps we want to count
     *   }
     * })
    **/
    count<T extends CCRoadmapCountArgs>(
      args?: Subset<T, CCRoadmapCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], CCRoadmapCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a CCRoadmap.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends CCRoadmapAggregateArgs>(args: Subset<T, CCRoadmapAggregateArgs>): Prisma.PrismaPromise<GetCCRoadmapAggregateType<T>>

    /**
     * Group by CCRoadmap.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {CCRoadmapGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends CCRoadmapGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: CCRoadmapGroupByArgs['orderBy'] }
        : { orderBy?: CCRoadmapGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, CCRoadmapGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetCCRoadmapGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the CCRoadmap model
   */
  readonly fields: CCRoadmapFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for CCRoadmap.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__CCRoadmapClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    user<T extends CCUserDefaultArgs<ExtArgs> = {}>(args?: Subset<T, CCUserDefaultArgs<ExtArgs>>): Prisma__CCUserClient<$Result.GetResult<Prisma.$CCUserPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the CCRoadmap model
   */ 
  interface CCRoadmapFieldRefs {
    readonly id: FieldRef<"CCRoadmap", 'String'>
    readonly userId: FieldRef<"CCRoadmap", 'String'>
    readonly markdown: FieldRef<"CCRoadmap", 'String'>
    readonly generatedAt: FieldRef<"CCRoadmap", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * CCRoadmap findUnique
   */
  export type CCRoadmapFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * Filter, which CCRoadmap to fetch.
     */
    where: CCRoadmapWhereUniqueInput
  }

  /**
   * CCRoadmap findUniqueOrThrow
   */
  export type CCRoadmapFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * Filter, which CCRoadmap to fetch.
     */
    where: CCRoadmapWhereUniqueInput
  }

  /**
   * CCRoadmap findFirst
   */
  export type CCRoadmapFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * Filter, which CCRoadmap to fetch.
     */
    where?: CCRoadmapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCRoadmaps to fetch.
     */
    orderBy?: CCRoadmapOrderByWithRelationInput | CCRoadmapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CCRoadmaps.
     */
    cursor?: CCRoadmapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCRoadmaps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCRoadmaps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CCRoadmaps.
     */
    distinct?: CCRoadmapScalarFieldEnum | CCRoadmapScalarFieldEnum[]
  }

  /**
   * CCRoadmap findFirstOrThrow
   */
  export type CCRoadmapFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * Filter, which CCRoadmap to fetch.
     */
    where?: CCRoadmapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCRoadmaps to fetch.
     */
    orderBy?: CCRoadmapOrderByWithRelationInput | CCRoadmapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for CCRoadmaps.
     */
    cursor?: CCRoadmapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCRoadmaps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCRoadmaps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of CCRoadmaps.
     */
    distinct?: CCRoadmapScalarFieldEnum | CCRoadmapScalarFieldEnum[]
  }

  /**
   * CCRoadmap findMany
   */
  export type CCRoadmapFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * Filter, which CCRoadmaps to fetch.
     */
    where?: CCRoadmapWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of CCRoadmaps to fetch.
     */
    orderBy?: CCRoadmapOrderByWithRelationInput | CCRoadmapOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing CCRoadmaps.
     */
    cursor?: CCRoadmapWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` CCRoadmaps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` CCRoadmaps.
     */
    skip?: number
    distinct?: CCRoadmapScalarFieldEnum | CCRoadmapScalarFieldEnum[]
  }

  /**
   * CCRoadmap create
   */
  export type CCRoadmapCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * The data needed to create a CCRoadmap.
     */
    data: XOR<CCRoadmapCreateInput, CCRoadmapUncheckedCreateInput>
  }

  /**
   * CCRoadmap createMany
   */
  export type CCRoadmapCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many CCRoadmaps.
     */
    data: CCRoadmapCreateManyInput | CCRoadmapCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * CCRoadmap createManyAndReturn
   */
  export type CCRoadmapCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many CCRoadmaps.
     */
    data: CCRoadmapCreateManyInput | CCRoadmapCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * CCRoadmap update
   */
  export type CCRoadmapUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * The data needed to update a CCRoadmap.
     */
    data: XOR<CCRoadmapUpdateInput, CCRoadmapUncheckedUpdateInput>
    /**
     * Choose, which CCRoadmap to update.
     */
    where: CCRoadmapWhereUniqueInput
  }

  /**
   * CCRoadmap updateMany
   */
  export type CCRoadmapUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update CCRoadmaps.
     */
    data: XOR<CCRoadmapUpdateManyMutationInput, CCRoadmapUncheckedUpdateManyInput>
    /**
     * Filter which CCRoadmaps to update
     */
    where?: CCRoadmapWhereInput
  }

  /**
   * CCRoadmap upsert
   */
  export type CCRoadmapUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * The filter to search for the CCRoadmap to update in case it exists.
     */
    where: CCRoadmapWhereUniqueInput
    /**
     * In case the CCRoadmap found by the `where` argument doesn't exist, create a new CCRoadmap with this data.
     */
    create: XOR<CCRoadmapCreateInput, CCRoadmapUncheckedCreateInput>
    /**
     * In case the CCRoadmap was found with the provided `where` argument, update it with this data.
     */
    update: XOR<CCRoadmapUpdateInput, CCRoadmapUncheckedUpdateInput>
  }

  /**
   * CCRoadmap delete
   */
  export type CCRoadmapDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
    /**
     * Filter which CCRoadmap to delete.
     */
    where: CCRoadmapWhereUniqueInput
  }

  /**
   * CCRoadmap deleteMany
   */
  export type CCRoadmapDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which CCRoadmaps to delete
     */
    where?: CCRoadmapWhereInput
  }

  /**
   * CCRoadmap without action
   */
  export type CCRoadmapDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the CCRoadmap
     */
    select?: CCRoadmapSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: CCRoadmapInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const CCUserScalarFieldEnum: {
    id: 'id',
    name: 'name',
    email: 'email',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type CCUserScalarFieldEnum = (typeof CCUserScalarFieldEnum)[keyof typeof CCUserScalarFieldEnum]


  export const CCWizardAnswersScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    school: 'school',
    major: 'major',
    year: 'year',
    coursework: 'coursework',
    interests: 'interests',
    resumeText: 'resumeText',
    linkedinText: 'linkedinText',
    targetRoles: 'targetRoles',
    scenarioNotes: 'scenarioNotes',
    updatedAt: 'updatedAt'
  };

  export type CCWizardAnswersScalarFieldEnum = (typeof CCWizardAnswersScalarFieldEnum)[keyof typeof CCWizardAnswersScalarFieldEnum]


  export const CCRoadmapScalarFieldEnum: {
    id: 'id',
    userId: 'userId',
    markdown: 'markdown',
    generatedAt: 'generatedAt'
  };

  export type CCRoadmapScalarFieldEnum = (typeof CCRoadmapScalarFieldEnum)[keyof typeof CCRoadmapScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    
  /**
   * Deep Input Types
   */


  export type CCUserWhereInput = {
    AND?: CCUserWhereInput | CCUserWhereInput[]
    OR?: CCUserWhereInput[]
    NOT?: CCUserWhereInput | CCUserWhereInput[]
    id?: StringFilter<"CCUser"> | string
    name?: StringFilter<"CCUser"> | string
    email?: StringFilter<"CCUser"> | string
    createdAt?: DateTimeFilter<"CCUser"> | Date | string
    updatedAt?: DateTimeFilter<"CCUser"> | Date | string
    wizardAnswers?: XOR<CCWizardAnswersNullableRelationFilter, CCWizardAnswersWhereInput> | null
    roadmaps?: CCRoadmapListRelationFilter
  }

  export type CCUserOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    wizardAnswers?: CCWizardAnswersOrderByWithRelationInput
    roadmaps?: CCRoadmapOrderByRelationAggregateInput
  }

  export type CCUserWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    email?: string
    AND?: CCUserWhereInput | CCUserWhereInput[]
    OR?: CCUserWhereInput[]
    NOT?: CCUserWhereInput | CCUserWhereInput[]
    name?: StringFilter<"CCUser"> | string
    createdAt?: DateTimeFilter<"CCUser"> | Date | string
    updatedAt?: DateTimeFilter<"CCUser"> | Date | string
    wizardAnswers?: XOR<CCWizardAnswersNullableRelationFilter, CCWizardAnswersWhereInput> | null
    roadmaps?: CCRoadmapListRelationFilter
  }, "id" | "email">

  export type CCUserOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: CCUserCountOrderByAggregateInput
    _max?: CCUserMaxOrderByAggregateInput
    _min?: CCUserMinOrderByAggregateInput
  }

  export type CCUserScalarWhereWithAggregatesInput = {
    AND?: CCUserScalarWhereWithAggregatesInput | CCUserScalarWhereWithAggregatesInput[]
    OR?: CCUserScalarWhereWithAggregatesInput[]
    NOT?: CCUserScalarWhereWithAggregatesInput | CCUserScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CCUser"> | string
    name?: StringWithAggregatesFilter<"CCUser"> | string
    email?: StringWithAggregatesFilter<"CCUser"> | string
    createdAt?: DateTimeWithAggregatesFilter<"CCUser"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"CCUser"> | Date | string
  }

  export type CCWizardAnswersWhereInput = {
    AND?: CCWizardAnswersWhereInput | CCWizardAnswersWhereInput[]
    OR?: CCWizardAnswersWhereInput[]
    NOT?: CCWizardAnswersWhereInput | CCWizardAnswersWhereInput[]
    id?: StringFilter<"CCWizardAnswers"> | string
    userId?: StringFilter<"CCWizardAnswers"> | string
    school?: StringFilter<"CCWizardAnswers"> | string
    major?: StringFilter<"CCWizardAnswers"> | string
    year?: StringFilter<"CCWizardAnswers"> | string
    coursework?: StringFilter<"CCWizardAnswers"> | string
    interests?: StringFilter<"CCWizardAnswers"> | string
    resumeText?: StringFilter<"CCWizardAnswers"> | string
    linkedinText?: StringFilter<"CCWizardAnswers"> | string
    targetRoles?: StringFilter<"CCWizardAnswers"> | string
    scenarioNotes?: StringFilter<"CCWizardAnswers"> | string
    updatedAt?: DateTimeFilter<"CCWizardAnswers"> | Date | string
    user?: XOR<CCUserRelationFilter, CCUserWhereInput>
  }

  export type CCWizardAnswersOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    school?: SortOrder
    major?: SortOrder
    year?: SortOrder
    coursework?: SortOrder
    interests?: SortOrder
    resumeText?: SortOrder
    linkedinText?: SortOrder
    targetRoles?: SortOrder
    scenarioNotes?: SortOrder
    updatedAt?: SortOrder
    user?: CCUserOrderByWithRelationInput
  }

  export type CCWizardAnswersWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    userId?: string
    AND?: CCWizardAnswersWhereInput | CCWizardAnswersWhereInput[]
    OR?: CCWizardAnswersWhereInput[]
    NOT?: CCWizardAnswersWhereInput | CCWizardAnswersWhereInput[]
    school?: StringFilter<"CCWizardAnswers"> | string
    major?: StringFilter<"CCWizardAnswers"> | string
    year?: StringFilter<"CCWizardAnswers"> | string
    coursework?: StringFilter<"CCWizardAnswers"> | string
    interests?: StringFilter<"CCWizardAnswers"> | string
    resumeText?: StringFilter<"CCWizardAnswers"> | string
    linkedinText?: StringFilter<"CCWizardAnswers"> | string
    targetRoles?: StringFilter<"CCWizardAnswers"> | string
    scenarioNotes?: StringFilter<"CCWizardAnswers"> | string
    updatedAt?: DateTimeFilter<"CCWizardAnswers"> | Date | string
    user?: XOR<CCUserRelationFilter, CCUserWhereInput>
  }, "id" | "userId">

  export type CCWizardAnswersOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    school?: SortOrder
    major?: SortOrder
    year?: SortOrder
    coursework?: SortOrder
    interests?: SortOrder
    resumeText?: SortOrder
    linkedinText?: SortOrder
    targetRoles?: SortOrder
    scenarioNotes?: SortOrder
    updatedAt?: SortOrder
    _count?: CCWizardAnswersCountOrderByAggregateInput
    _max?: CCWizardAnswersMaxOrderByAggregateInput
    _min?: CCWizardAnswersMinOrderByAggregateInput
  }

  export type CCWizardAnswersScalarWhereWithAggregatesInput = {
    AND?: CCWizardAnswersScalarWhereWithAggregatesInput | CCWizardAnswersScalarWhereWithAggregatesInput[]
    OR?: CCWizardAnswersScalarWhereWithAggregatesInput[]
    NOT?: CCWizardAnswersScalarWhereWithAggregatesInput | CCWizardAnswersScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    userId?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    school?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    major?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    year?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    coursework?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    interests?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    resumeText?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    linkedinText?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    targetRoles?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    scenarioNotes?: StringWithAggregatesFilter<"CCWizardAnswers"> | string
    updatedAt?: DateTimeWithAggregatesFilter<"CCWizardAnswers"> | Date | string
  }

  export type CCRoadmapWhereInput = {
    AND?: CCRoadmapWhereInput | CCRoadmapWhereInput[]
    OR?: CCRoadmapWhereInput[]
    NOT?: CCRoadmapWhereInput | CCRoadmapWhereInput[]
    id?: StringFilter<"CCRoadmap"> | string
    userId?: StringFilter<"CCRoadmap"> | string
    markdown?: StringFilter<"CCRoadmap"> | string
    generatedAt?: DateTimeFilter<"CCRoadmap"> | Date | string
    user?: XOR<CCUserRelationFilter, CCUserWhereInput>
  }

  export type CCRoadmapOrderByWithRelationInput = {
    id?: SortOrder
    userId?: SortOrder
    markdown?: SortOrder
    generatedAt?: SortOrder
    user?: CCUserOrderByWithRelationInput
  }

  export type CCRoadmapWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: CCRoadmapWhereInput | CCRoadmapWhereInput[]
    OR?: CCRoadmapWhereInput[]
    NOT?: CCRoadmapWhereInput | CCRoadmapWhereInput[]
    userId?: StringFilter<"CCRoadmap"> | string
    markdown?: StringFilter<"CCRoadmap"> | string
    generatedAt?: DateTimeFilter<"CCRoadmap"> | Date | string
    user?: XOR<CCUserRelationFilter, CCUserWhereInput>
  }, "id">

  export type CCRoadmapOrderByWithAggregationInput = {
    id?: SortOrder
    userId?: SortOrder
    markdown?: SortOrder
    generatedAt?: SortOrder
    _count?: CCRoadmapCountOrderByAggregateInput
    _max?: CCRoadmapMaxOrderByAggregateInput
    _min?: CCRoadmapMinOrderByAggregateInput
  }

  export type CCRoadmapScalarWhereWithAggregatesInput = {
    AND?: CCRoadmapScalarWhereWithAggregatesInput | CCRoadmapScalarWhereWithAggregatesInput[]
    OR?: CCRoadmapScalarWhereWithAggregatesInput[]
    NOT?: CCRoadmapScalarWhereWithAggregatesInput | CCRoadmapScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"CCRoadmap"> | string
    userId?: StringWithAggregatesFilter<"CCRoadmap"> | string
    markdown?: StringWithAggregatesFilter<"CCRoadmap"> | string
    generatedAt?: DateTimeWithAggregatesFilter<"CCRoadmap"> | Date | string
  }

  export type CCUserCreateInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
    wizardAnswers?: CCWizardAnswersCreateNestedOneWithoutUserInput
    roadmaps?: CCRoadmapCreateNestedManyWithoutUserInput
  }

  export type CCUserUncheckedCreateInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
    wizardAnswers?: CCWizardAnswersUncheckedCreateNestedOneWithoutUserInput
    roadmaps?: CCRoadmapUncheckedCreateNestedManyWithoutUserInput
  }

  export type CCUserUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    wizardAnswers?: CCWizardAnswersUpdateOneWithoutUserNestedInput
    roadmaps?: CCRoadmapUpdateManyWithoutUserNestedInput
  }

  export type CCUserUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    wizardAnswers?: CCWizardAnswersUncheckedUpdateOneWithoutUserNestedInput
    roadmaps?: CCRoadmapUncheckedUpdateManyWithoutUserNestedInput
  }

  export type CCUserCreateManyInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type CCUserUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCUserUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCWizardAnswersCreateInput = {
    id?: string
    school?: string
    major?: string
    year?: string
    coursework?: string
    interests?: string
    resumeText?: string
    linkedinText?: string
    targetRoles?: string
    scenarioNotes?: string
    updatedAt?: Date | string
    user: CCUserCreateNestedOneWithoutWizardAnswersInput
  }

  export type CCWizardAnswersUncheckedCreateInput = {
    id?: string
    userId: string
    school?: string
    major?: string
    year?: string
    coursework?: string
    interests?: string
    resumeText?: string
    linkedinText?: string
    targetRoles?: string
    scenarioNotes?: string
    updatedAt?: Date | string
  }

  export type CCWizardAnswersUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    school?: StringFieldUpdateOperationsInput | string
    major?: StringFieldUpdateOperationsInput | string
    year?: StringFieldUpdateOperationsInput | string
    coursework?: StringFieldUpdateOperationsInput | string
    interests?: StringFieldUpdateOperationsInput | string
    resumeText?: StringFieldUpdateOperationsInput | string
    linkedinText?: StringFieldUpdateOperationsInput | string
    targetRoles?: StringFieldUpdateOperationsInput | string
    scenarioNotes?: StringFieldUpdateOperationsInput | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: CCUserUpdateOneRequiredWithoutWizardAnswersNestedInput
  }

  export type CCWizardAnswersUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    school?: StringFieldUpdateOperationsInput | string
    major?: StringFieldUpdateOperationsInput | string
    year?: StringFieldUpdateOperationsInput | string
    coursework?: StringFieldUpdateOperationsInput | string
    interests?: StringFieldUpdateOperationsInput | string
    resumeText?: StringFieldUpdateOperationsInput | string
    linkedinText?: StringFieldUpdateOperationsInput | string
    targetRoles?: StringFieldUpdateOperationsInput | string
    scenarioNotes?: StringFieldUpdateOperationsInput | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCWizardAnswersCreateManyInput = {
    id?: string
    userId: string
    school?: string
    major?: string
    year?: string
    coursework?: string
    interests?: string
    resumeText?: string
    linkedinText?: string
    targetRoles?: string
    scenarioNotes?: string
    updatedAt?: Date | string
  }

  export type CCWizardAnswersUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    school?: StringFieldUpdateOperationsInput | string
    major?: StringFieldUpdateOperationsInput | string
    year?: StringFieldUpdateOperationsInput | string
    coursework?: StringFieldUpdateOperationsInput | string
    interests?: StringFieldUpdateOperationsInput | string
    resumeText?: StringFieldUpdateOperationsInput | string
    linkedinText?: StringFieldUpdateOperationsInput | string
    targetRoles?: StringFieldUpdateOperationsInput | string
    scenarioNotes?: StringFieldUpdateOperationsInput | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCWizardAnswersUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    school?: StringFieldUpdateOperationsInput | string
    major?: StringFieldUpdateOperationsInput | string
    year?: StringFieldUpdateOperationsInput | string
    coursework?: StringFieldUpdateOperationsInput | string
    interests?: StringFieldUpdateOperationsInput | string
    resumeText?: StringFieldUpdateOperationsInput | string
    linkedinText?: StringFieldUpdateOperationsInput | string
    targetRoles?: StringFieldUpdateOperationsInput | string
    scenarioNotes?: StringFieldUpdateOperationsInput | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCRoadmapCreateInput = {
    id?: string
    markdown: string
    generatedAt?: Date | string
    user: CCUserCreateNestedOneWithoutRoadmapsInput
  }

  export type CCRoadmapUncheckedCreateInput = {
    id?: string
    userId: string
    markdown: string
    generatedAt?: Date | string
  }

  export type CCRoadmapUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    user?: CCUserUpdateOneRequiredWithoutRoadmapsNestedInput
  }

  export type CCRoadmapUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCRoadmapCreateManyInput = {
    id?: string
    userId: string
    markdown: string
    generatedAt?: Date | string
  }

  export type CCRoadmapUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCRoadmapUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    userId?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type CCWizardAnswersNullableRelationFilter = {
    is?: CCWizardAnswersWhereInput | null
    isNot?: CCWizardAnswersWhereInput | null
  }

  export type CCRoadmapListRelationFilter = {
    every?: CCRoadmapWhereInput
    some?: CCRoadmapWhereInput
    none?: CCRoadmapWhereInput
  }

  export type CCRoadmapOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type CCUserCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CCUserMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type CCUserMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    email?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type CCUserRelationFilter = {
    is?: CCUserWhereInput
    isNot?: CCUserWhereInput
  }

  export type CCWizardAnswersCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    school?: SortOrder
    major?: SortOrder
    year?: SortOrder
    coursework?: SortOrder
    interests?: SortOrder
    resumeText?: SortOrder
    linkedinText?: SortOrder
    targetRoles?: SortOrder
    scenarioNotes?: SortOrder
    updatedAt?: SortOrder
  }

  export type CCWizardAnswersMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    school?: SortOrder
    major?: SortOrder
    year?: SortOrder
    coursework?: SortOrder
    interests?: SortOrder
    resumeText?: SortOrder
    linkedinText?: SortOrder
    targetRoles?: SortOrder
    scenarioNotes?: SortOrder
    updatedAt?: SortOrder
  }

  export type CCWizardAnswersMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    school?: SortOrder
    major?: SortOrder
    year?: SortOrder
    coursework?: SortOrder
    interests?: SortOrder
    resumeText?: SortOrder
    linkedinText?: SortOrder
    targetRoles?: SortOrder
    scenarioNotes?: SortOrder
    updatedAt?: SortOrder
  }

  export type CCRoadmapCountOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    markdown?: SortOrder
    generatedAt?: SortOrder
  }

  export type CCRoadmapMaxOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    markdown?: SortOrder
    generatedAt?: SortOrder
  }

  export type CCRoadmapMinOrderByAggregateInput = {
    id?: SortOrder
    userId?: SortOrder
    markdown?: SortOrder
    generatedAt?: SortOrder
  }

  export type CCWizardAnswersCreateNestedOneWithoutUserInput = {
    create?: XOR<CCWizardAnswersCreateWithoutUserInput, CCWizardAnswersUncheckedCreateWithoutUserInput>
    connectOrCreate?: CCWizardAnswersCreateOrConnectWithoutUserInput
    connect?: CCWizardAnswersWhereUniqueInput
  }

  export type CCRoadmapCreateNestedManyWithoutUserInput = {
    create?: XOR<CCRoadmapCreateWithoutUserInput, CCRoadmapUncheckedCreateWithoutUserInput> | CCRoadmapCreateWithoutUserInput[] | CCRoadmapUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CCRoadmapCreateOrConnectWithoutUserInput | CCRoadmapCreateOrConnectWithoutUserInput[]
    createMany?: CCRoadmapCreateManyUserInputEnvelope
    connect?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
  }

  export type CCWizardAnswersUncheckedCreateNestedOneWithoutUserInput = {
    create?: XOR<CCWizardAnswersCreateWithoutUserInput, CCWizardAnswersUncheckedCreateWithoutUserInput>
    connectOrCreate?: CCWizardAnswersCreateOrConnectWithoutUserInput
    connect?: CCWizardAnswersWhereUniqueInput
  }

  export type CCRoadmapUncheckedCreateNestedManyWithoutUserInput = {
    create?: XOR<CCRoadmapCreateWithoutUserInput, CCRoadmapUncheckedCreateWithoutUserInput> | CCRoadmapCreateWithoutUserInput[] | CCRoadmapUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CCRoadmapCreateOrConnectWithoutUserInput | CCRoadmapCreateOrConnectWithoutUserInput[]
    createMany?: CCRoadmapCreateManyUserInputEnvelope
    connect?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type CCWizardAnswersUpdateOneWithoutUserNestedInput = {
    create?: XOR<CCWizardAnswersCreateWithoutUserInput, CCWizardAnswersUncheckedCreateWithoutUserInput>
    connectOrCreate?: CCWizardAnswersCreateOrConnectWithoutUserInput
    upsert?: CCWizardAnswersUpsertWithoutUserInput
    disconnect?: CCWizardAnswersWhereInput | boolean
    delete?: CCWizardAnswersWhereInput | boolean
    connect?: CCWizardAnswersWhereUniqueInput
    update?: XOR<XOR<CCWizardAnswersUpdateToOneWithWhereWithoutUserInput, CCWizardAnswersUpdateWithoutUserInput>, CCWizardAnswersUncheckedUpdateWithoutUserInput>
  }

  export type CCRoadmapUpdateManyWithoutUserNestedInput = {
    create?: XOR<CCRoadmapCreateWithoutUserInput, CCRoadmapUncheckedCreateWithoutUserInput> | CCRoadmapCreateWithoutUserInput[] | CCRoadmapUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CCRoadmapCreateOrConnectWithoutUserInput | CCRoadmapCreateOrConnectWithoutUserInput[]
    upsert?: CCRoadmapUpsertWithWhereUniqueWithoutUserInput | CCRoadmapUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: CCRoadmapCreateManyUserInputEnvelope
    set?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    disconnect?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    delete?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    connect?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    update?: CCRoadmapUpdateWithWhereUniqueWithoutUserInput | CCRoadmapUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: CCRoadmapUpdateManyWithWhereWithoutUserInput | CCRoadmapUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: CCRoadmapScalarWhereInput | CCRoadmapScalarWhereInput[]
  }

  export type CCWizardAnswersUncheckedUpdateOneWithoutUserNestedInput = {
    create?: XOR<CCWizardAnswersCreateWithoutUserInput, CCWizardAnswersUncheckedCreateWithoutUserInput>
    connectOrCreate?: CCWizardAnswersCreateOrConnectWithoutUserInput
    upsert?: CCWizardAnswersUpsertWithoutUserInput
    disconnect?: CCWizardAnswersWhereInput | boolean
    delete?: CCWizardAnswersWhereInput | boolean
    connect?: CCWizardAnswersWhereUniqueInput
    update?: XOR<XOR<CCWizardAnswersUpdateToOneWithWhereWithoutUserInput, CCWizardAnswersUpdateWithoutUserInput>, CCWizardAnswersUncheckedUpdateWithoutUserInput>
  }

  export type CCRoadmapUncheckedUpdateManyWithoutUserNestedInput = {
    create?: XOR<CCRoadmapCreateWithoutUserInput, CCRoadmapUncheckedCreateWithoutUserInput> | CCRoadmapCreateWithoutUserInput[] | CCRoadmapUncheckedCreateWithoutUserInput[]
    connectOrCreate?: CCRoadmapCreateOrConnectWithoutUserInput | CCRoadmapCreateOrConnectWithoutUserInput[]
    upsert?: CCRoadmapUpsertWithWhereUniqueWithoutUserInput | CCRoadmapUpsertWithWhereUniqueWithoutUserInput[]
    createMany?: CCRoadmapCreateManyUserInputEnvelope
    set?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    disconnect?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    delete?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    connect?: CCRoadmapWhereUniqueInput | CCRoadmapWhereUniqueInput[]
    update?: CCRoadmapUpdateWithWhereUniqueWithoutUserInput | CCRoadmapUpdateWithWhereUniqueWithoutUserInput[]
    updateMany?: CCRoadmapUpdateManyWithWhereWithoutUserInput | CCRoadmapUpdateManyWithWhereWithoutUserInput[]
    deleteMany?: CCRoadmapScalarWhereInput | CCRoadmapScalarWhereInput[]
  }

  export type CCUserCreateNestedOneWithoutWizardAnswersInput = {
    create?: XOR<CCUserCreateWithoutWizardAnswersInput, CCUserUncheckedCreateWithoutWizardAnswersInput>
    connectOrCreate?: CCUserCreateOrConnectWithoutWizardAnswersInput
    connect?: CCUserWhereUniqueInput
  }

  export type CCUserUpdateOneRequiredWithoutWizardAnswersNestedInput = {
    create?: XOR<CCUserCreateWithoutWizardAnswersInput, CCUserUncheckedCreateWithoutWizardAnswersInput>
    connectOrCreate?: CCUserCreateOrConnectWithoutWizardAnswersInput
    upsert?: CCUserUpsertWithoutWizardAnswersInput
    connect?: CCUserWhereUniqueInput
    update?: XOR<XOR<CCUserUpdateToOneWithWhereWithoutWizardAnswersInput, CCUserUpdateWithoutWizardAnswersInput>, CCUserUncheckedUpdateWithoutWizardAnswersInput>
  }

  export type CCUserCreateNestedOneWithoutRoadmapsInput = {
    create?: XOR<CCUserCreateWithoutRoadmapsInput, CCUserUncheckedCreateWithoutRoadmapsInput>
    connectOrCreate?: CCUserCreateOrConnectWithoutRoadmapsInput
    connect?: CCUserWhereUniqueInput
  }

  export type CCUserUpdateOneRequiredWithoutRoadmapsNestedInput = {
    create?: XOR<CCUserCreateWithoutRoadmapsInput, CCUserUncheckedCreateWithoutRoadmapsInput>
    connectOrCreate?: CCUserCreateOrConnectWithoutRoadmapsInput
    upsert?: CCUserUpsertWithoutRoadmapsInput
    connect?: CCUserWhereUniqueInput
    update?: XOR<XOR<CCUserUpdateToOneWithWhereWithoutRoadmapsInput, CCUserUpdateWithoutRoadmapsInput>, CCUserUncheckedUpdateWithoutRoadmapsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type CCWizardAnswersCreateWithoutUserInput = {
    id?: string
    school?: string
    major?: string
    year?: string
    coursework?: string
    interests?: string
    resumeText?: string
    linkedinText?: string
    targetRoles?: string
    scenarioNotes?: string
    updatedAt?: Date | string
  }

  export type CCWizardAnswersUncheckedCreateWithoutUserInput = {
    id?: string
    school?: string
    major?: string
    year?: string
    coursework?: string
    interests?: string
    resumeText?: string
    linkedinText?: string
    targetRoles?: string
    scenarioNotes?: string
    updatedAt?: Date | string
  }

  export type CCWizardAnswersCreateOrConnectWithoutUserInput = {
    where: CCWizardAnswersWhereUniqueInput
    create: XOR<CCWizardAnswersCreateWithoutUserInput, CCWizardAnswersUncheckedCreateWithoutUserInput>
  }

  export type CCRoadmapCreateWithoutUserInput = {
    id?: string
    markdown: string
    generatedAt?: Date | string
  }

  export type CCRoadmapUncheckedCreateWithoutUserInput = {
    id?: string
    markdown: string
    generatedAt?: Date | string
  }

  export type CCRoadmapCreateOrConnectWithoutUserInput = {
    where: CCRoadmapWhereUniqueInput
    create: XOR<CCRoadmapCreateWithoutUserInput, CCRoadmapUncheckedCreateWithoutUserInput>
  }

  export type CCRoadmapCreateManyUserInputEnvelope = {
    data: CCRoadmapCreateManyUserInput | CCRoadmapCreateManyUserInput[]
    skipDuplicates?: boolean
  }

  export type CCWizardAnswersUpsertWithoutUserInput = {
    update: XOR<CCWizardAnswersUpdateWithoutUserInput, CCWizardAnswersUncheckedUpdateWithoutUserInput>
    create: XOR<CCWizardAnswersCreateWithoutUserInput, CCWizardAnswersUncheckedCreateWithoutUserInput>
    where?: CCWizardAnswersWhereInput
  }

  export type CCWizardAnswersUpdateToOneWithWhereWithoutUserInput = {
    where?: CCWizardAnswersWhereInput
    data: XOR<CCWizardAnswersUpdateWithoutUserInput, CCWizardAnswersUncheckedUpdateWithoutUserInput>
  }

  export type CCWizardAnswersUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    school?: StringFieldUpdateOperationsInput | string
    major?: StringFieldUpdateOperationsInput | string
    year?: StringFieldUpdateOperationsInput | string
    coursework?: StringFieldUpdateOperationsInput | string
    interests?: StringFieldUpdateOperationsInput | string
    resumeText?: StringFieldUpdateOperationsInput | string
    linkedinText?: StringFieldUpdateOperationsInput | string
    targetRoles?: StringFieldUpdateOperationsInput | string
    scenarioNotes?: StringFieldUpdateOperationsInput | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCWizardAnswersUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    school?: StringFieldUpdateOperationsInput | string
    major?: StringFieldUpdateOperationsInput | string
    year?: StringFieldUpdateOperationsInput | string
    coursework?: StringFieldUpdateOperationsInput | string
    interests?: StringFieldUpdateOperationsInput | string
    resumeText?: StringFieldUpdateOperationsInput | string
    linkedinText?: StringFieldUpdateOperationsInput | string
    targetRoles?: StringFieldUpdateOperationsInput | string
    scenarioNotes?: StringFieldUpdateOperationsInput | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCRoadmapUpsertWithWhereUniqueWithoutUserInput = {
    where: CCRoadmapWhereUniqueInput
    update: XOR<CCRoadmapUpdateWithoutUserInput, CCRoadmapUncheckedUpdateWithoutUserInput>
    create: XOR<CCRoadmapCreateWithoutUserInput, CCRoadmapUncheckedCreateWithoutUserInput>
  }

  export type CCRoadmapUpdateWithWhereUniqueWithoutUserInput = {
    where: CCRoadmapWhereUniqueInput
    data: XOR<CCRoadmapUpdateWithoutUserInput, CCRoadmapUncheckedUpdateWithoutUserInput>
  }

  export type CCRoadmapUpdateManyWithWhereWithoutUserInput = {
    where: CCRoadmapScalarWhereInput
    data: XOR<CCRoadmapUpdateManyMutationInput, CCRoadmapUncheckedUpdateManyWithoutUserInput>
  }

  export type CCRoadmapScalarWhereInput = {
    AND?: CCRoadmapScalarWhereInput | CCRoadmapScalarWhereInput[]
    OR?: CCRoadmapScalarWhereInput[]
    NOT?: CCRoadmapScalarWhereInput | CCRoadmapScalarWhereInput[]
    id?: StringFilter<"CCRoadmap"> | string
    userId?: StringFilter<"CCRoadmap"> | string
    markdown?: StringFilter<"CCRoadmap"> | string
    generatedAt?: DateTimeFilter<"CCRoadmap"> | Date | string
  }

  export type CCUserCreateWithoutWizardAnswersInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
    roadmaps?: CCRoadmapCreateNestedManyWithoutUserInput
  }

  export type CCUserUncheckedCreateWithoutWizardAnswersInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
    roadmaps?: CCRoadmapUncheckedCreateNestedManyWithoutUserInput
  }

  export type CCUserCreateOrConnectWithoutWizardAnswersInput = {
    where: CCUserWhereUniqueInput
    create: XOR<CCUserCreateWithoutWizardAnswersInput, CCUserUncheckedCreateWithoutWizardAnswersInput>
  }

  export type CCUserUpsertWithoutWizardAnswersInput = {
    update: XOR<CCUserUpdateWithoutWizardAnswersInput, CCUserUncheckedUpdateWithoutWizardAnswersInput>
    create: XOR<CCUserCreateWithoutWizardAnswersInput, CCUserUncheckedCreateWithoutWizardAnswersInput>
    where?: CCUserWhereInput
  }

  export type CCUserUpdateToOneWithWhereWithoutWizardAnswersInput = {
    where?: CCUserWhereInput
    data: XOR<CCUserUpdateWithoutWizardAnswersInput, CCUserUncheckedUpdateWithoutWizardAnswersInput>
  }

  export type CCUserUpdateWithoutWizardAnswersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roadmaps?: CCRoadmapUpdateManyWithoutUserNestedInput
  }

  export type CCUserUncheckedUpdateWithoutWizardAnswersInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    roadmaps?: CCRoadmapUncheckedUpdateManyWithoutUserNestedInput
  }

  export type CCUserCreateWithoutRoadmapsInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
    wizardAnswers?: CCWizardAnswersCreateNestedOneWithoutUserInput
  }

  export type CCUserUncheckedCreateWithoutRoadmapsInput = {
    id?: string
    name: string
    email: string
    createdAt?: Date | string
    updatedAt?: Date | string
    wizardAnswers?: CCWizardAnswersUncheckedCreateNestedOneWithoutUserInput
  }

  export type CCUserCreateOrConnectWithoutRoadmapsInput = {
    where: CCUserWhereUniqueInput
    create: XOR<CCUserCreateWithoutRoadmapsInput, CCUserUncheckedCreateWithoutRoadmapsInput>
  }

  export type CCUserUpsertWithoutRoadmapsInput = {
    update: XOR<CCUserUpdateWithoutRoadmapsInput, CCUserUncheckedUpdateWithoutRoadmapsInput>
    create: XOR<CCUserCreateWithoutRoadmapsInput, CCUserUncheckedCreateWithoutRoadmapsInput>
    where?: CCUserWhereInput
  }

  export type CCUserUpdateToOneWithWhereWithoutRoadmapsInput = {
    where?: CCUserWhereInput
    data: XOR<CCUserUpdateWithoutRoadmapsInput, CCUserUncheckedUpdateWithoutRoadmapsInput>
  }

  export type CCUserUpdateWithoutRoadmapsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    wizardAnswers?: CCWizardAnswersUpdateOneWithoutUserNestedInput
  }

  export type CCUserUncheckedUpdateWithoutRoadmapsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    email?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    wizardAnswers?: CCWizardAnswersUncheckedUpdateOneWithoutUserNestedInput
  }

  export type CCRoadmapCreateManyUserInput = {
    id?: string
    markdown: string
    generatedAt?: Date | string
  }

  export type CCRoadmapUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCRoadmapUncheckedUpdateWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type CCRoadmapUncheckedUpdateManyWithoutUserInput = {
    id?: StringFieldUpdateOperationsInput | string
    markdown?: StringFieldUpdateOperationsInput | string
    generatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use CCUserCountOutputTypeDefaultArgs instead
     */
    export type CCUserCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CCUserCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CCUserDefaultArgs instead
     */
    export type CCUserArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CCUserDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CCWizardAnswersDefaultArgs instead
     */
    export type CCWizardAnswersArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CCWizardAnswersDefaultArgs<ExtArgs>
    /**
     * @deprecated Use CCRoadmapDefaultArgs instead
     */
    export type CCRoadmapArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = CCRoadmapDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}