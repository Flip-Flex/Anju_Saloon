> # ⚠️ STALE DOCUMENT — DO NOT FOLLOW
>
> **This file is obsolete and refers to a Java/Spring Boot backend
> (`BrokerController.java`, `@PreAuthorize`) that does not exist in this
> repository.** It is leftover documentation from a previous project.
> The current app is a Vite/React SPA that talks directly to Firebase
> Firestore through the client SDK (`src/lib/api.ts`) and has no Java
> backend. No action from this document is required.

# IMPERATIVE BACKEND FIX REQUIRED (Server 500 Error)

The "Cashier" panel is failing to load Brokers because of a **CRITICAL SYNTAX ERROR** in the Backend Java Code.
This error causes the server to crash (500 Internal Server Error) whenever a Cashier tries to access the data.

## The Problem
In `BrokerController.java`, you are currently using:
```java
@PreAuthorize("hasRole('ADMIN', 'CASHIER')") // <--- THIS IS WRONG AND CAUSES CRASH
```
The `hasRole` function only accepts **ONE** argument. Passing two causes the server to throw an exception.

## The Solution
You **MUST** change the annotation to use `hasAnyRole` (allows multiple) or correct the logic.

### Correct Code:
Update your `BrokerController.java` to use `hasAnyRole`:

```java
// Correct Syntax:
@PreAuthorize("hasAnyRole('ADMIN', 'CASHIER')")
public List<Broker> getAll() ...
```

Please apply this change to ALL endpoints in `BrokerController` (`/add`, `/all`, `/commissions`, etc.) and **RESTART THE BACKEND SERVER**.

Once this is fixed, the frontend will automatically start working. There are no changes needed on the frontend.
