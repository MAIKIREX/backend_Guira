> ## Documentation Index
> Fetch the complete documentation index at: https://apidocs.bridge.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a Bridge Wallet



## OpenAPI

````yaml https://withbridge-image1-sv-usw2-monorail-openapi.s3.amazonaws.com/latest.json post /customers/{customerID}/wallets
openapi: 3.0.2
info:
  title: Bridge API
  description: APIs to move into, out of, and between any form of a dollar
  version: '1'
servers:
  - url: https://api.bridge.xyz/v0
    description: The base path for all resources
security:
  - ApiKey: []
tags:
  - name: Customers
  - name: Fiat Payout Configuration
  - name: External Accounts
  - name: Transfers
  - name: Prefunded Accounts
  - name: Balances
  - name: Liquidation Addresses
  - name: Developers
  - name: Plaid
  - name: Virtual Accounts
  - name: Static Memos
  - name: Cards
  - name: Funds Requests
  - name: Webhooks
  - name: Lists
  - name: Crypto Return Policies
  - name: Rewards
  - name: Associated Persons
paths:
  /customers/{customerID}/wallets:
    post:
      tags:
        - Bridge Wallets
      summary: Create a Bridge Wallet
      parameters:
        - $ref: '#/components/parameters/CustomerIDParameter'
        - $ref: '#/components/parameters/IdempotencyKeyParameter'
      requestBody:
        description: Bridge Wallet to be created
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateBridgeWallet'
      responses:
        '201':
          description: Bridge Wallet created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateBridgeWalletResponse'
              examples:
                SuccessfulLiquidationAddressCreateResponse:
                  $ref: '#/components/examples/SuccessfulBridgeWalletCreateResponse'
        '400':
          $ref: '#/components/responses/BadRequestError'
        '401':
          $ref: '#/components/responses/AuthenticationError'
        '404':
          $ref: '#/components/responses/NotFoundError'
        '500':
          $ref: '#/components/responses/UnexpectedError'
components:
  parameters:
    CustomerIDParameter:
      name: customerID
      in: path
      required: true
      schema:
        $ref: '#/components/schemas/Id'
    IdempotencyKeyParameter:
      in: header
      name: Idempotency-Key
      required: true
      schema:
        type: string
  schemas:
    CreateBridgeWallet:
      required:
        - chain
      properties:
        chain:
          $ref: '#/components/schemas/BridgeWalletChain'
    CreateBridgeWalletResponse:
      required:
        - chain
      allOf:
        - $ref: '#/components/schemas/CreateBridgeWallet'
        - properties:
            id:
              $ref: '#/components/schemas/Id'
              readOnly: true
            address:
              description: The blockchain address of the Bridge Wallet
              type: string
              readOnly: true
            created_at:
              readOnly: true
              type: string
              description: Time of creation of the Bridge Wallet
              format: date-time
            updated_at:
              readOnly: true
              type: string
              description: Time of most recent update of the Bridge Wallet
              format: date-time
    Id:
      description: A UUID that uniquely identifies a resource
      type: string
      pattern: '[a-z0-9]*'
      minLength: 1
      maxLength: 42
    BridgeWalletChain:
      type: string
      enum:
        - base
        - ethereum
        - solana
        - tempo
        - tron
    Error:
      required:
        - code
        - message
      properties:
        code:
          type: string
          minLength: 1
          maxLength: 256
        message:
          type: string
          minLength: 1
          maxLength: 512
        source:
          title: ErrorSource
          required:
            - location
            - key
          properties:
            location:
              type: string
              enum:
                - path
                - query
                - body
                - header
            key:
              type: string
              description: >-
                Comma separated names of the properties or parameters causing
                the error
  examples:
    SuccessfulBridgeWalletCreateResponse:
      summary: A successful Bridge Wallet creation response
      value:
        id: bw_123
        chain: solana
        address: 9kV3ZMehKVyxfHKCcaDLye3P9HHw2MP4jtQa2gKBUmCs
        created_at: '2023-11-22T21:31:30.515Z'
        updated_at: '2023-11-22T21:31:30.515Z'
  responses:
    BadRequestError:
      description: Request containing missing or invalid parameters.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            BadCustomerRequestErrorExample:
              summary: Bad customer request
              value:
                code: bad_customer_request
                message: fields missing from customer body.
                name: first_name,ssn
    AuthenticationError:
      description: Missing or invalid API key
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            MissingTokenError:
              summary: No Api-Key header
              description: The header may be missing or misspelled.
              value:
                code: required
                location: header
                name: Api-Key
                message: Missing Api-Key header
            InvalidTokenError:
              summary: Invalid key in Api-Key header
              value:
                code: invalid
                location: header
                name: Api-Key
                message: Invalid Api-Key header
    NotFoundError:
      description: No resource found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            NotFoundErrorExample:
              summary: Invalid customer id
              value:
                code: Invalid
                message: Unknown customer id
    UnexpectedError:
      description: Unexpected error. User may try and send the request again.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          examples:
            UnexpectedError:
              summary: An unexpected error
              value:
                errors:
                  - code: unexpected
                    message: An expected error occurred, you may try again later
  securitySchemes:
    ApiKey:
      type: apiKey
      name: Api-Key
      in: header

````

Built with [Mintlify](https://mintlify.com).
Explicar