# fingercosmos-plugin

Manejo de Fingerprint para ZkTeco

## Install

```bash
npm install fingercosmos-plugin
npx cap sync
```

## API

<docgen-index>

* [`initialize()`](#initialize)
* [`startRegistration(...)`](#startregistration)
* [`startIdentification()`](#startidentification)
* [`deleteFingerprint(...)`](#deletefingerprint)
* [`getRegisteredUsers()`](#getregisteredusers)
* [`checkConnection()`](#checkconnection)
* [`configureDevice(...)`](#configuredevice)
* [`addListener('enrollmentStep', ...)`](#addlistenerenrollmentstep-)
* [`addListener('identificationResult', ...)`](#addlisteneridentificationresult-)
* [`addListener('deviceStatus', ...)`](#addlistenerdevicestatus-)
* [Interfaces](#interfaces)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

### initialize()

```typescript
initialize() => Promise<{ connected: boolean; deviceInfo?: string; }>
```

Inicializa la conexión con el dispositivo ZKTeco SLK20r

**Returns:** <code>Promise&lt;{ connected: boolean; deviceInfo?: string; }&gt;</code>

--------------------


### startRegistration(...)

```typescript
startRegistration(options: { userId: string; employeeId: string; }) => Promise<{ success: boolean; userId: string; template?: string; }>
```

Inicia el proceso de registro de huella digital

| Param         | Type                                                 |
| ------------- | ---------------------------------------------------- |
| **`options`** | <code>{ userId: string; employeeId: string; }</code> |

**Returns:** <code>Promise&lt;{ success: boolean; userId: string; template?: string; }&gt;</code>

--------------------


### startIdentification()

```typescript
startIdentification() => Promise<{ match: boolean; userId?: string; employeeId?: string; score?: number; timestamp?: number; }>
```

Inicia el proceso de identificación/autenticación

**Returns:** <code>Promise&lt;{ match: boolean; userId?: string; employeeId?: string; score?: number; timestamp?: number; }&gt;</code>

--------------------


### deleteFingerprint(...)

```typescript
deleteFingerprint(options: { userId: string; }) => Promise<{ success: boolean; userId: string; }>
```

Elimina una huella digital registrada

| Param         | Type                             |
| ------------- | -------------------------------- |
| **`options`** | <code>{ userId: string; }</code> |

**Returns:** <code>Promise&lt;{ success: boolean; userId: string; }&gt;</code>

--------------------


### getRegisteredUsers()

```typescript
getRegisteredUsers() => Promise<{ users: Array<{ userId: string; employeeId: string; registered: boolean; }>; }>
```

Obtiene la lista de usuarios registrados

**Returns:** <code>Promise&lt;{ users: { userId: string; employeeId: string; registered: boolean; }[]; }&gt;</code>

--------------------


### checkConnection()

```typescript
checkConnection() => Promise<{ connected: boolean; deviceInfo?: string; }>
```

Verifica el estado de conexión del dispositivo

**Returns:** <code>Promise&lt;{ connected: boolean; deviceInfo?: string; }&gt;</code>

--------------------


### configureDevice(...)

```typescript
configureDevice(options: { timeout?: number; sensitivity?: number; beepEnabled?: boolean; }) => Promise<{ success: boolean; }>
```

Configura parámetros del dispositivo

| Param         | Type                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| **`options`** | <code>{ timeout?: number; sensitivity?: number; beepEnabled?: boolean; }</code> |

**Returns:** <code>Promise&lt;{ success: boolean; }&gt;</code>

--------------------


### addListener('enrollmentStep', ...)

```typescript
addListener(eventName: 'enrollmentStep', listenerFunc: (data: { step: number; message: string; progress: number; }) => void) => Promise<PluginListenerHandle> & PluginListenerHandle
```

Listener para eventos de progreso durante el registro

| Param              | Type                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------ |
| **`eventName`**    | <code>'enrollmentStep'</code>                                                        |
| **`listenerFunc`** | <code>(data: { step: number; message: string; progress: number; }) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt; & <a href="#pluginlistenerhandle">PluginListenerHandle</a></code>

--------------------


### addListener('identificationResult', ...)

```typescript
addListener(eventName: 'identificationResult', listenerFunc: (data: { match: boolean; userId?: string; employeeId?: string; score?: number; }) => void) => Promise<PluginListenerHandle> & PluginListenerHandle
```

Listener para eventos de identificación

| Param              | Type                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **`eventName`**    | <code>'identificationResult'</code>                                                                       |
| **`listenerFunc`** | <code>(data: { match: boolean; userId?: string; employeeId?: string; score?: number; }) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt; & <a href="#pluginlistenerhandle">PluginListenerHandle</a></code>

--------------------


### addListener('deviceStatus', ...)

```typescript
addListener(eventName: 'deviceStatus', listenerFunc: (data: { connected: boolean; message: string; }) => void) => Promise<PluginListenerHandle> & PluginListenerHandle
```

Listener para eventos de conexión del dispositivo

| Param              | Type                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| **`eventName`**    | <code>'deviceStatus'</code>                                              |
| **`listenerFunc`** | <code>(data: { connected: boolean; message: string; }) =&gt; void</code> |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt; & <a href="#pluginlistenerhandle">PluginListenerHandle</a></code>

--------------------


### Interfaces


#### Array

| Prop         | Type                | Description                                                                                            |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| **`length`** | <code>number</code> | Gets or sets the length of the array. This is a number one higher than the highest index in the array. |

| Method             | Signature                                                                                                                     | Description                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **toString**       | () =&gt; string                                                                                                               | Returns a string representation of an array.                                                                                                                                                                                                |
| **toLocaleString** | () =&gt; string                                                                                                               | Returns a string representation of an array. The elements are converted to string using their toLocalString methods.                                                                                                                        |
| **pop**            | () =&gt; T \| undefined                                                                                                       | Removes the last element from an array and returns it. If the array is empty, undefined is returned and the array is not modified.                                                                                                          |
| **push**           | (...items: T[]) =&gt; number                                                                                                  | Appends new elements to the end of an array, and returns the new length of the array.                                                                                                                                                       |
| **concat**         | (...items: <a href="#concatarray">ConcatArray</a>&lt;T&gt;[]) =&gt; T[]                                                       | Combines two or more arrays. This method returns a new array without modifying any existing arrays.                                                                                                                                         |
| **concat**         | (...items: (T \| <a href="#concatarray">ConcatArray</a>&lt;T&gt;)[]) =&gt; T[]                                                | Combines two or more arrays. This method returns a new array without modifying any existing arrays.                                                                                                                                         |
| **join**           | (separator?: string \| undefined) =&gt; string                                                                                | Adds all the elements of an array into a string, separated by the specified separator string.                                                                                                                                               |
| **reverse**        | () =&gt; T[]                                                                                                                  | Reverses the elements in an array in place. This method mutates the array and returns a reference to the same array.                                                                                                                        |
| **shift**          | () =&gt; T \| undefined                                                                                                       | Removes the first element from an array and returns it. If the array is empty, undefined is returned and the array is not modified.                                                                                                         |
| **slice**          | (start?: number \| undefined, end?: number \| undefined) =&gt; T[]                                                            | Returns a copy of a section of an array. For both start and end, a negative index can be used to indicate an offset from the end of the array. For example, -2 refers to the second to last element of the array.                           |
| **sort**           | (compareFn?: ((a: T, b: T) =&gt; number) \| undefined) =&gt; this                                                             | Sorts an array in place. This method mutates the array and returns a reference to the same array.                                                                                                                                           |
| **splice**         | (start: number, deleteCount?: number \| undefined) =&gt; T[]                                                                  | Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.                                                                                                                      |
| **splice**         | (start: number, deleteCount: number, ...items: T[]) =&gt; T[]                                                                 | Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.                                                                                                                      |
| **unshift**        | (...items: T[]) =&gt; number                                                                                                  | Inserts new elements at the start of an array, and returns the new length of the array.                                                                                                                                                     |
| **indexOf**        | (searchElement: T, fromIndex?: number \| undefined) =&gt; number                                                              | Returns the index of the first occurrence of a value in an array, or -1 if it is not present.                                                                                                                                               |
| **lastIndexOf**    | (searchElement: T, fromIndex?: number \| undefined) =&gt; number                                                              | Returns the index of the last occurrence of a specified value in an array, or -1 if it is not present.                                                                                                                                      |
| **every**          | &lt;S extends T&gt;(predicate: (value: T, index: number, array: T[]) =&gt; value is S, thisArg?: any) =&gt; this is S[]       | Determines whether all the members of an array satisfy the specified test.                                                                                                                                                                  |
| **every**          | (predicate: (value: T, index: number, array: T[]) =&gt; unknown, thisArg?: any) =&gt; boolean                                 | Determines whether all the members of an array satisfy the specified test.                                                                                                                                                                  |
| **some**           | (predicate: (value: T, index: number, array: T[]) =&gt; unknown, thisArg?: any) =&gt; boolean                                 | Determines whether the specified callback function returns true for any element of an array.                                                                                                                                                |
| **forEach**        | (callbackfn: (value: T, index: number, array: T[]) =&gt; void, thisArg?: any) =&gt; void                                      | Performs the specified action for each element in an array.                                                                                                                                                                                 |
| **map**            | &lt;U&gt;(callbackfn: (value: T, index: number, array: T[]) =&gt; U, thisArg?: any) =&gt; U[]                                 | Calls a defined callback function on each element of an array, and returns an array that contains the results.                                                                                                                              |
| **filter**         | &lt;S extends T&gt;(predicate: (value: T, index: number, array: T[]) =&gt; value is S, thisArg?: any) =&gt; S[]               | Returns the elements of an array that meet the condition specified in a callback function.                                                                                                                                                  |
| **filter**         | (predicate: (value: T, index: number, array: T[]) =&gt; unknown, thisArg?: any) =&gt; T[]                                     | Returns the elements of an array that meet the condition specified in a callback function.                                                                                                                                                  |
| **reduce**         | (callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) =&gt; T) =&gt; T                           | Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.                      |
| **reduce**         | (callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) =&gt; T, initialValue: T) =&gt; T          |                                                                                                                                                                                                                                             |
| **reduce**         | &lt;U&gt;(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) =&gt; U, initialValue: U) =&gt; U | Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.                      |
| **reduceRight**    | (callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) =&gt; T) =&gt; T                           | Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function. |
| **reduceRight**    | (callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) =&gt; T, initialValue: T) =&gt; T          |                                                                                                                                                                                                                                             |
| **reduceRight**    | &lt;U&gt;(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) =&gt; U, initialValue: U) =&gt; U | Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function. |


#### ConcatArray

| Prop         | Type                |
| ------------ | ------------------- |
| **`length`** | <code>number</code> |

| Method    | Signature                                                          |
| --------- | ------------------------------------------------------------------ |
| **join**  | (separator?: string \| undefined) =&gt; string                     |
| **slice** | (start?: number \| undefined, end?: number \| undefined) =&gt; T[] |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |

</docgen-api>
