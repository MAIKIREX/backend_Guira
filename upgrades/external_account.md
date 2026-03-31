> ## Documentation Index
> Fetch the complete documentation index at: https://apidocs.bridge.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a new External Account

> _Note_: If adding US external accounts, we recommend reading through the US Beneficiary Address Validation doc ([link](https://apidocs.bridge.xyz/docs/us-beneficiary-address-validation)) to avoid issues related to incorrect addresses.




## OpenAPI

````yaml https://withbridge-image1-sv-usw2-monorail-openapi.s3.amazonaws.com/latest.json post /customers/{customerID}/external_accounts
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
  /customers/{customerID}/external_accounts:
    parameters:
      - $ref: '#/components/parameters/CustomerIDParameter'
    post:
      tags:
        - External Accounts
      summary: Create a new External Account
      description: >
        _Note_: If adding US external accounts, we recommend reading through the
        US Beneficiary Address Validation doc
        ([link](https://apidocs.bridge.xyz/docs/us-beneficiary-address-validation))
        to avoid issues related to incorrect addresses.
      parameters:
        - $ref: '#/components/parameters/IdempotencyKeyParameter'
      requestBody:
        description: New External Account object to be created
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateExternalAccountInput'
            examples:
              ACH:
                $ref: '#/components/examples/CreateAchExternalAccountRequest'
              IBAN:
                $ref: '#/components/examples/CreateIbanExternalAccountRequest'
              SWIFT:
                $ref: '#/components/examples/CreateSwiftExternalAccountRequest'
              CLABE:
                $ref: '#/components/examples/CreateClabeExternalAccountRequest'
              Pix_Key:
                $ref: '#/components/examples/CreatePixExternalAccountRequest'
              Pix_BrCode:
                $ref: '#/components/examples/CreateBrCodeExternalAccountRequest'
              BreB:
                $ref: '#/components/examples/CreateBreBExternalAccountRequest'
      responses:
        '201':
          description: External Account object created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ExternalAccountResponse'
              examples:
                ACH:
                  $ref: '#/components/examples/SuccessfulExternalAccountResponse'
                IBAN:
                  $ref: '#/components/examples/SuccessfulIbanExternalAccountResponse'
                SWIFT:
                  $ref: '#/components/examples/SuccessfulSwiftExternalAccountResponse'
                CLABE:
                  $ref: '#/components/examples/SuccessfulClabeExternalAccountResponse'
                Pix_Key:
                  $ref: >-
                    #/components/examples/SuccessfulPixKeyExternalAccountResponse
                Pix_BrCode:
                  $ref: >-
                    #/components/examples/SuccessfulBrCodeExternalAccountResponse
                BreB:
                  $ref: '#/components/examples/SuccessfulBreBExternalAccountResponse'
        '400':
          $ref: '#/components/responses/BadRequestError'
        '401':
          $ref: '#/components/responses/AuthenticationError'
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
    CreateExternalAccountInput:
      description: Request body for creating an external account.
      oneOf:
        - $ref: '#/components/schemas/CreateExternalAccountUsInput'
        - $ref: '#/components/schemas/CreateExternalAccountIbanInput'
        - $ref: '#/components/schemas/CreateExternalAccountSWIFTInput'
        - $ref: '#/components/schemas/CreateExternalAccountClabeInput'
        - $ref: '#/components/schemas/CreateExternalAccountPixKeyInput'
        - $ref: '#/components/schemas/CreateExternalAccountBrCodeInput'
        - $ref: '#/components/schemas/CreateExternalAccountFPSInput'
        - $ref: '#/components/schemas/CreateExternalAccountBreBInput'
    ExternalAccountResponse:
      required:
        - id
        - customer_id
        - created_at
        - updated_at
        - account_owner_name
        - currency
        - account_type
        - active
      allOf:
        - $ref: '#/components/schemas/ExternalAccount'
        - type: object
          properties:
            account_validation:
              $ref: '#/components/schemas/AccountValidation'
              description: >-
                Present for Pix, SPEI/CLABE, and Bre-B accounts with a
                successful validation; contains validated owner and bank name.
              nullable: true
    Id:
      description: A UUID that uniquely identifies a resource
      type: string
      pattern: '[a-z0-9]*'
      minLength: 1
      maxLength: 42
    CreateExternalAccountUsInput:
      title: ACH/Wire
      description: >-
        US bank account using account and routing numbers for ACH or Wire
        transfers
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithoutOwnerInfo'
        - type: object
          required:
            - account_type
            - account
            - currency
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - us
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `usd` for US
                accounts.
              type: string
              enum:
                - usd
            account:
              $ref: '#/components/schemas/UsBankAccount'
            account_number:
              writeOnly: true
              description: >-
                Account number of your bank account. This field is getting
                deprecated in favor of the `account.account_number` field for US
                accounts.
              type: string
              minLength: 12
              deprecated: true
            routing_number:
              writeOnly: true
              description: >-
                Routing number of your bank account. This field is getting
                deprecated in favor of the `account.routing_number` field for US
                accounts.
              type: string
              minLength: 9
              deprecated: true
    CreateExternalAccountIbanInput:
      title: IBAN
      description: >-
        IBAN bank account for European and international transfers (SEPA
        transfers use IBAN)
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - iban
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - iban
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `eur` for
                IBAN accounts.
              type: string
              enum:
                - eur
            iban:
              $ref: '#/components/schemas/IbanBankAccount'
    CreateExternalAccountSWIFTInput:
      title: SWIFT
      description: SWIFT international wire transfer
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - swift
            - account_owner_name
          properties:
            currency:
              description: Currency associated with the bank account.
              type: string
              enum:
                - usd
            account_type:
              type: string
              enum:
                - unknown
                - iban
              description: Type of the bank account.
            swift:
              $ref: '#/components/schemas/SwiftBankAccount'
    CreateExternalAccountClabeInput:
      title: CLABE
      description: Mexican CLABE account for SPEI transfers
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithoutOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - clabe
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - clabe
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `mxn` for
                CLABE (SPEI) accounts.
              type: string
              enum:
                - mxn
            clabe:
              $ref: '#/components/schemas/ClabeBankAccount'
    CreateExternalAccountPixKeyInput:
      title: Pix (Pix Key)
      description: Brazilian Pix instant payment system using a Pix key
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithoutOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - pix_key
            - account_owner_name
          properties:
            currency:
              description: >-
                Currency associated with the bank account. Must be `brl` for Pix
                accounts.
              type: string
              enum:
                - brl
            account_type:
              type: string
              enum:
                - pix
              description: Type of the bank account.
            pix_key:
              $ref: '#/components/schemas/PixKeyBankAccount'
              writeOnly: true
              description: >-
                Brazilian Pix key bank account information. Required when
                account type is `pix` and using a Pix key.
    CreateExternalAccountBrCodeInput:
      title: Pix (BR Code)
      description: Brazilian Pix instant payment system using a BR Code (Copie e cola)
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithoutOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - br_code
            - account_owner_name
          properties:
            currency:
              description: >-
                Currency associated with the bank account. Must be `brl` for Pix
                accounts.
              type: string
              enum:
                - brl
            account_type:
              type: string
              enum:
                - pix
              description: Type of the bank account.
            br_code:
              $ref: '#/components/schemas/BrCodeBankAccount'
              writeOnly: true
              description: >-
                Brazilian BR Code (Copie e cola) bank account information.
                Required when account type is `pix` and using a BR Code.
    CreateExternalAccountFPSInput:
      title: FPS (beta)
      description: UK bank account information for the Faster Payments payment rail
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - account
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - gb
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `gbp` for GB
                accounts.
              type: string
              enum:
                - gbp
            account:
              $ref: '#/components/schemas/GbBankAccount'
    CreateExternalAccountBreBInput:
      title: Bre-B
      description: Colombian Bre-B account for COP transfers
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithoutOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - account
            - account_owner_name
          properties:
            currency:
              description: >-
                Currency associated with the bank account. Must be `cop` for
                Bre-B accounts.
              type: string
              enum:
                - cop
            account_type:
              type: string
              enum:
                - bre_b
              description: Type of the bank account.
            account:
              $ref: '#/components/schemas/BreBBankAccount'
              writeOnly: true
              description: >-
                Colombian Bre-B bank account information. Required when account
                type is `bre_b`.
    ExternalAccount:
      oneOf:
        - $ref: '#/components/schemas/ExternalAccountUs'
        - $ref: '#/components/schemas/ExternalAccountIban'
        - $ref: '#/components/schemas/ExternalAccountUnknown'
        - $ref: '#/components/schemas/ExternalAccountClabe'
        - $ref: '#/components/schemas/ExternalAccountPix'
        - $ref: '#/components/schemas/ExternalAccountGb'
        - $ref: '#/components/schemas/ExternalAccountBreB'
    AccountValidation:
      description: >-
        Validated account owner and bank name from successful Infinia
        validation. Present only for Pix, SPEI/CLABE, and Bre-B accounts that
        have been successfully validated.
      type: object
      properties:
        validated_account_owner_name:
          type: string
          nullable: true
          description: Account owner name as returned by the validation provider.
        validated_bank_name:
          type: string
          nullable: true
          description: Bank name as returned by the validation provider.
        validated_document_number_last4:
          type: string
          nullable: true
          readOnly: true
          description: >-
            Last 4 characters of the account owner's document number, as
            returned by the validation provider. Present only for Bre-B
            (Colombian) accounts.
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
    ExternalAccountBaseWithoutOwnerInfo:
      description: >-
        Shared writable properties for creating an external account (without
        account owner info bundle)
      properties:
        id:
          $ref: '#/components/schemas/Id'
          readOnly: true
        customer_id:
          description: The id of the Bridge customer that this External Account belongs to
          type: string
          minLength: 1
          readOnly: true
        bank_name:
          description: Bank name of the account
          type: string
          minLength: 1
          maxLength: 256
        account_owner_name:
          description: Owner of the bank account
          type: string
          minLength: 1
          maxLength: 256
        created_at:
          readOnly: true
          type: string
          description: Time of creation of the External Account
          format: date-time
        updated_at:
          readOnly: true
          type: string
          description: Time of last update of the External Account
          format: date-time
        active:
          readOnly: true
          type: boolean
          description: Whether or not this External Account is active
        address:
          $ref: '#/components/schemas/ExternalAccountAddress'
          writeOnly: true
          description: Address of the beneficiary of this account.
        deactivation_reason:
          $ref: '#/components/schemas/ExternalAccountDeactivationReason'
          readOnly: true
          description: Reason for deactivation when this External Account is inactive
        deactivation_details:
          readOnly: true
          type: string
          description: >-
            Additional details about the deactivation when this External Account
            is inactive
    UsBankAccount:
      title: us
      required:
        - account_number
        - routing_number
        - last_4
      properties:
        account_number:
          type: string
          description: The bank account number
          minLength: 1
          writeOnly: true
        routing_number:
          type: string
          description: The bank routing number
          minLength: 9
          maxLength: 9
        last_4:
          description: Last 4 digits of the bank account number
          minLength: 1
          type: string
          readOnly: true
        checking_or_savings:
          $ref: '#/components/schemas/CheckingOrSavingsType'
    ExternalAccountBaseWithOwnerInfo:
      description: Properties shared by all external account types
      properties:
        id:
          $ref: '#/components/schemas/Id'
          readOnly: true
        customer_id:
          description: The id of the Bridge customer that this External Account belongs to
          type: string
          minLength: 1
          readOnly: true
        bank_name:
          description: Bank name of the account (e.g. "Chase")
          type: string
          minLength: 1
          maxLength: 256
        account_owner_name:
          description: >
            Owner of the account Bank Account (e.g. "John Doe"). For ach or wire
            transfers, this field must be at least 3 characters, at most 35
            characters, and follow either of the following regex patterns:

            - ach: `^(?!\s*$)[\x20-\x7E]*$`

            - wire: ```^[ \w!"#$%&'()+,\-./:;<=>?@\\_`~]*$```
          type: string
          minLength: 1
          maxLength: 256
        created_at:
          readOnly: true
          type: string
          description: Time of creation of the External Account
          format: date-time
        updated_at:
          readOnly: true
          type: string
          description: Time of last update of the External Account
          format: date-time
        active:
          readOnly: true
          type: boolean
          description: Whether or not this External Account is active
        account_owner_type:
          $ref: '#/components/schemas/BankAccountOwnerType'
          description: >-
            The type of the account ownership. Required when the `account_type`
            is `iban`. For `individual` ownership, `first_name` and `last_name`
            are required. For `business` ownership, `business_name` is required.
        first_name:
          type: string
          description: >-
            First name of the individual account holder. Required when the
            `account_owner_type` is `individual`
        last_name:
          type: string
          description: >-
            Last name of the individual account holder. Required when the
            `account_owner_type` is `individual`
        business_name:
          type: string
          description: >-
            Business name of the business account holder. Required when the
            `account_owner_type` is `business`
        address:
          $ref: '#/components/schemas/ExternalAccountAddress'
          writeOnly: true
          description: >-
            Address of the beneficiary of this account. Please ensure the
            address is valid (Google Maps is good for this). US addresses used
            to receive wires must include a street number.
        deactivation_reason:
          $ref: '#/components/schemas/ExternalAccountDeactivationReason'
          readOnly: true
          description: Reason for deactivation when this External Account is inactive
        deactivation_details:
          readOnly: true
          type: string
          description: >-
            Additional details about the deactivation when this External Account
            is inactive
    IbanBankAccount:
      required:
        - account_number
        - country
        - last_4
      properties:
        account_number:
          type: string
          description: >-
            The International Bank Account Number (IBAN) that will be used to
            send the funds
          minLength: 1
          writeOnly: true
        bic:
          type: string
          description: The Bank Identifier Code (BIC) that will be used to send the funds
          minLength: 1
        country:
          description: >-
            Country in which the bank account is located. It's a three-letter
            alpha-3 country code as defined in the ISO 3166-1 spec.
          type: string
          minLength: 3
          maxLength: 3
        last_4:
          description: Last 4 digits of the bank account number
          minLength: 1
          type: string
          readOnly: true
    SwiftBankAccount:
      required:
        - account
        - address
        - category
        - purpose_of_funds
        - short_business_description
      properties:
        account:
          oneOf:
            - $ref: '#/components/schemas/IbanBankAccount'
            - $ref: '#/components/schemas/UnknownBankAccount'
        address:
          $ref: '#/components/schemas/Address'
          description: The bank address
        category:
          $ref: '#/components/schemas/SwiftCategory'
          description: >-
            The context of business operations. Can be `client`,
            `parent_company`, `subsidiary`, or `supplier`
        purpose_of_funds:
          description: >-
            The nature of the transactions this account will participate in. Can
            be `intra_group_transfer`, `invoice_for_goods_and_services`
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/SwiftPurposeOfFunds'
        short_business_description:
          description: How the business uses the funds
          type: string
    ClabeBankAccount:
      required:
        - account_number
        - last_4
      properties:
        account_number:
          type: string
          description: The CLABE account number of the bank account
          minLength: 18
          maxLength: 18
          writeOnly: true
        last_4:
          description: Last 4 digits of the CLABE
          minLength: 4
          maxLength: 4
          type: string
          readOnly: true
    PixKeyBankAccount:
      title: pix_key
      required:
        - pix_key
        - account_preview
      properties:
        pix_key:
          type: string
          description: >
            The Pix key for the Brazilian bank account. Must be one of the
            following formats:

            - **EVP (Virtual Payment Address)**: Random UUID generated by Banco
            Central do Brasil (e.g., `550e8400-e29b-41d4-a716-446655440000`)

            - **CPF (Tax ID)**: 11-digit individual tax number (e.g.,
            `12345678901`)

            - **CNPJ (Business Tax ID)**: 14-digit business tax number (e.g.,
            `12345678000195`)

            - **Phone**: Brazilian mobile phone in format +55 followed by 11
            digits (e.g., `+5511987654321`)

            - **Email**: Valid email address (e.g., `joao.silva@email.com`)
          minLength: 1
          writeOnly: true
        document_number:
          type: string
          description: >-
            Optional document number (CPF/CNPJ) associated with the Pix key. 
            Must be all numerals (no punctuation) if provided.
          writeOnly: true
        account_preview:
          description: Masked preview of the Pix key
          type: string
          readOnly: true
        document_number_last4:
          description: Last 4 digits of the document number (CPF/CNPJ) when available
          type: string
          readOnly: true
    BrCodeBankAccount:
      title: br_code
      required:
        - br_code
        - account_preview
      properties:
        br_code:
          type: string
          description: The Copie e cola code for Pix transactions
          minLength: 1
          writeOnly: true
        document_number:
          type: string
          description: >-
            Optional document number (CPF/CNPJ) associated with the Pix key. 
            Must be all numerals (no punctuation) if provided.
          writeOnly: true
        account_preview:
          description: Masked preview of the BR Code
          type: string
          readOnly: true
        document_number_last4:
          description: Last 4 digits of the document number (CPF/CNPJ) when available
          type: string
          readOnly: true
    GbBankAccount:
      title: gb
      type: object
      required:
        - account_number
        - last_4
        - sort_code
      properties:
        account_number:
          type: string
          description: The bank account number
          minLength: 8
          maxLength: 8
          example: 12345678
          writeOnly: true
        last_4:
          description: Last 4 digits of the bank account number
          minLength: 1
          type: string
          readOnly: true
        sort_code:
          type: string
          description: The sort code, without hyphens
          minLength: 6
          maxLength: 6
          example: 123456
    BreBBankAccount:
      title: bre_b
      required:
        - bre_b_key
        - last_4
      properties:
        bre_b_key:
          type: string
          description: The Bre-B key of the Colombian bank account
          writeOnly: true
        last_4:
          description: Last 4 digits of the Bre-B key
          minLength: 4
          maxLength: 4
          type: string
          readOnly: true
    ExternalAccountUs:
      title: ACH/Wire
      description: >-
        US bank account using account and routing numbers for ACH or Wire
        transfers
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - account
            - currency
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - us
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `usd` for US
                accounts.
              type: string
              enum:
                - usd
            account:
              $ref: '#/components/schemas/UsBankAccount'
            beneficiary_address_valid:
              readOnly: true
              type: boolean
              description: >-
                Whether the beneficiary address is valid. A valid beneficiary
                address is required for all US External Accounts
            last_4:
              description: >-
                Last 4 digits of the bank account number. This field is getting
                deprecated in favor of the `account.last_4` field
              type: string
              minLength: 1
              readOnly: true
              deprecated: true
            account_number:
              writeOnly: true
              description: >-
                Account number of your bank account. This field is getting
                deprecated in favor of the `account.account_number` field for US
                accounts.
              type: string
              minLength: 12
              deprecated: true
            routing_number:
              writeOnly: true
              description: >-
                Routing number of your bank account. This field is getting
                deprecated in favor of the `account.routing_number` field for US
                accounts.
              type: string
              minLength: 9
              deprecated: true
    ExternalAccountIban:
      title: IBAN
      description: >-
        IBAN bank account for European and international transfers (SEPA
        transfers use IBAN)
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - iban
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - iban
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `eur` for
                IBAN accounts.
              type: string
              enum:
                - eur
            iban:
              $ref: '#/components/schemas/IbanBankAccount'
    ExternalAccountUnknown:
      title: SWIFT
      description: SWIFT international wire transfer (account_type `iban` or `unknown`)
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
          properties:
            account_type:
              type: string
              enum:
                - unknown
                - iban
              description: Type of the bank account.
            currency:
              description: Currency associated with the bank account.
              type: string
              enum:
                - usd
            swift:
              $ref: '#/components/schemas/UnknownBankAccount'
    ExternalAccountClabe:
      title: CLABE
      description: Mexican CLABE account for SPEI transfers
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - clabe
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - clabe
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `mxn` for
                CLABE (SPEI) accounts.
              type: string
              enum:
                - mxn
            clabe:
              $ref: '#/components/schemas/ClabeBankAccount'
    ExternalAccountPix:
      title: Pix
      description: Brazilian Pix instant payment system
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
          properties:
            currency:
              description: >-
                Currency associated with the bank account. Must be `brl` for Pix
                accounts.
              type: string
              enum:
                - brl
            account_type:
              type: string
              enum:
                - pix
              description: Type of the bank account.
            pix_key:
              $ref: '#/components/schemas/PixKeyBankAccount'
              readOnly: true
              description: >-
                Pix key display info. Returned in GET responses when the account
                uses a Pix key.
            br_code:
              $ref: '#/components/schemas/BrCodeBankAccount'
              readOnly: true
              description: >-
                BR Code display info. Returned in GET responses when the account
                uses a BR Code.
    ExternalAccountGb:
      title: GB
      description: >-
        UK bank account using account number and sort code for Faster Payments
        payment rail
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - account
            - account_owner_name
          properties:
            account_type:
              type: string
              enum:
                - gb
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `gbp` for GB
                accounts.
              type: string
              enum:
                - gbp
            account:
              $ref: '#/components/schemas/GbBankAccount'
    ExternalAccountBreB:
      title: Bre-B
      description: Colombian Bre-B account for COP transfers
      allOf:
        - $ref: '#/components/schemas/ExternalAccountBaseWithOwnerInfo'
        - type: object
          required:
            - account_type
            - currency
            - account
          properties:
            account_type:
              type: string
              enum:
                - bre_b
              description: Type of the bank account.
            currency:
              description: >-
                Currency associated with the bank account. Must be `cop` for
                Bre-B accounts.
              type: string
              enum:
                - cop
            account:
              $ref: '#/components/schemas/BreBBankAccount'
    ExternalAccountAddress:
      required:
        - street_line_1
        - country
        - city
      properties:
        street_line_1:
          type: string
          minLength: 4
          maxLength: 35
        street_line_2:
          type: string
          maxLength: 35
        city:
          type: string
          minLength: 1
        state:
          type: string
          description: ISO 3166-2 subdivision code. Must be supplied for US addresses.
          minLength: 1
          maxLength: 3
        postal_code:
          type: string
          description: Must be supplied for countries that use postal codes.
          minLength: 1
        country:
          description: Three-letter alpha-3 country code as defined in the ISO 3166-1 spec.
          type: string
          minLength: 3
          maxLength: 3
    ExternalAccountDeactivationReason:
      description: Reason for deactivating an External Account
      type: string
      enum:
        - plaid_item_error
        - deactivated_due_to_bounceback
        - deleted_by_developer
        - requested_by_developer
        - invalid_account_number
        - invalid_bank_validation
        - rejected_by_bank_provider
    CheckingOrSavingsType:
      description: >-
        Determines whether the US account is treated as checking or savings. All
        US accounts will be treated as checking by default.
      type: string
      enum:
        - checking
        - savings
    BankAccountOwnerType:
      type: string
      enum:
        - individual
        - business
    UnknownBankAccount:
      description: SWIFT international wire transfer (account_type `unknown` or `iban`)
      required:
        - account_number
        - last_4
        - bic
      properties:
        account_number:
          type: string
          description: The number of the bank account
          minLength: 1
          writeOnly: true
        bic:
          type: string
          description: The Bank Identifier Code (BIC) of the bank account
          minLength: 1
        last_4:
          description: Last 4 digits of the bank account number
          minLength: 1
          type: string
          readOnly: true
    Address:
      required:
        - street_line_1
        - country
        - city
      properties:
        street_line_1:
          type: string
          minLength: 4
        street_line_2:
          type: string
          minLength: 1
        city:
          type: string
          minLength: 1
        state:
          type: string
          description: ISO 3166-2 subdivision code. Must be supplied for US addresses.
          minLength: 1
          maxLength: 3
        postal_code:
          type: string
          description: Must be supplied for countries that use postal codes.
          minLength: 1
        country:
          description: Three-letter alpha-3 country code as defined in the ISO 3166-1 spec.
          type: string
          minLength: 3
          maxLength: 3
    SwiftCategory:
      type: string
      description: >-
        The category of the Swift account. Can be `client`, `parent_company`,
        `subsidiary`, or `supplier`
    SwiftPurposeOfFunds:
      type: string
      description: >-
        The purpose of funds for the Swift account. Can be
        `intra_group_transfer`, `invoice_for_goods_and_services`
  examples:
    CreateAchExternalAccountRequest:
      summary: Create ACH or Wire External Account (US)
      value:
        currency: usd
        bank_name: Wells Fargo
        account_owner_name: John Doe
        account_type: us
        account:
          account_number: '1210002481111'
          routing_number: '121000248'
          checking_or_savings: checking
        address:
          street_line_1: 123 Main St
          city: San Francisco
          state: CA
          postal_code: '94102'
          country: USA
    CreateIbanExternalAccountRequest:
      summary: Create IBAN External Account
      value:
        currency: eur
        bank_name: AAC CAPITAL PARTNERS LIMITED
        account_owner_name: John Doe
        account_type: iban
        iban:
          account_number: NL91ABNA0417164300
          bic: BARBGB2LLEI
          country: NLD
        account_owner_type: individual
        first_name: John
        last_name: Doe
        address:
          street_line_1: Dam 1
          city: Amsterdam
          postal_code: 1012 JS
          country: NLD
    CreateSwiftExternalAccountRequest:
      summary: Create SWIFT External Account
      value:
        currency: gbp
        bank_name: Barclays Bank PLC
        account_owner_name: Jane Smith
        account_type: iban
        swift:
          account:
            account_number: GB29NWBK60161331926819
            bic: BARCGB22
            country: GBR
          address:
            street_line_1: 1 Churchill Place
            city: London
            postal_code: E14 5HP
            country: GBR
          category: client
          purpose_of_funds:
            - invoice_for_goods_and_services
          short_business_description: Payment for consulting services
        account_owner_type: business
        business_name: Smith Consulting Ltd
        address:
          street_line_1: 10 Downing Street
          city: London
          postal_code: SW1A 2AA
          country: GBR
    CreateClabeExternalAccountRequest:
      summary: Create CLABE External Account (SPEI for MXN)
      value:
        currency: mxn
        bank_name: Banco Santander México
        account_owner_name: Juan García
        account_type: clabe
        clabe:
          account_number: '014180655500000007'
        account_owner_type: individual
        first_name: Juan
        last_name: García
        address:
          street_line_1: Avenida Paseo de la Reforma 500
          city: Ciudad de México
          postal_code: '06600'
          country: MEX
    CreatePixExternalAccountRequest:
      summary: Create Pix External Account with Pix Key (Brazil)
      value:
        currency: brl
        bank_name: Banco do Brasil
        account_owner_name: João Silva
        account_type: pix
        pix_key:
          pix_key: joao.silva@email.com
          document_number: '12345678901'
        account_owner_type: individual
        first_name: João
        last_name: Silva
        address:
          street_line_1: Rua XV de Novembro, 500
          city: São Paulo
          state: SP
          postal_code: 01013-001
          country: BRA
    CreateBrCodeExternalAccountRequest:
      summary: Create Pix External Account with BR Code (Brazil)
      value:
        currency: brl
        bank_name: Banco do Brasil
        account_owner_name: João Silva
        account_type: pix
        br_code:
          br_code: >-
            00020126580014br.gov.bcb.pix0136a629532e-7693-4846-852d-1bbff6b2f8cd520400005303986540510.005802BR5913Fulano
            de Tal6008BRASILIA62070503***63041D3D
          document_number: '12345678901'
        account_owner_type: individual
        first_name: João
        last_name: Silva
        address:
          street_line_1: Rua XV de Novembro, 500
          city: São Paulo
          state: SP
          postal_code: 01013-001
          country: BRA
    CreateBreBExternalAccountRequest:
      summary: Create Bre-B External Account (COP)
      value:
        currency: cop
        account_owner_name: Juan Garcia
        account_type: bre_b
        account:
          bre_b_key: '1234567890123456'
    SuccessfulExternalAccountResponse:
      summary: A successful ACH External Account object (US)
      value:
        id: ea_123
        account_type: us
        currency: usd
        customer_id: cust_123
        account_owner_name: John Doe
        bank_name: Wells Fargo
        last_4: '1111'
        active: true
        beneficiary_address_valid: true
        account:
          last_4: '1111'
          routing_number: '121000248'
          checking_or_savings: checking
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
    SuccessfulIbanExternalAccountResponse:
      summary: A successful IBAN External Account object
      value:
        id: ea_123
        customer_id: cust_123
        account_type: iban
        currency: eur
        account_owner_name: John Doe
        bank_name: AAC CAPITAL PARTNERS LIMITED
        active: true
        iban:
          last_4: '5981'
          bic: BARBGB2LLEI
          country: NLD
        account_owner_type: individual
        first_name: John
        last_name: Doe
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
    SuccessfulSwiftExternalAccountResponse:
      summary: A successful SWIFT External Account object
      value:
        id: ea_234
        customer_id: cust_234
        account_type: iban
        currency: gbp
        account_owner_name: Jane Smith
        bank_name: Barclays Bank PLC
        active: true
        swift:
          account:
            last_4: '6819'
            bic: BARCGB22
            country: GBR
          category: client
          purpose_of_funds:
            - invoice_for_goods_and_services
          short_business_description: Payment for consulting services
        account_owner_type: business
        business_name: Smith Consulting Ltd
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
    SuccessfulClabeExternalAccountResponse:
      summary: A successful CLABE External Account object (SPEI)
      value:
        id: ea_567
        customer_id: cust_567
        account_type: clabe
        currency: mxn
        account_owner_name: Juan García
        bank_name: Banco Santander México
        active: true
        clabe:
          last_4: '0007'
        account_validation:
          validated_account_owner_name: Juan García
          validated_bank_name: Banco Santander México
        account_owner_type: individual
        first_name: Juan
        last_name: García
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
    SuccessfulPixKeyExternalAccountResponse:
      summary: A successful Pix key External Account object
      value:
        id: ea_123
        customer_id: cust_123
        account_type: pix
        currency: brl
        account_owner_name: João Silva
        bank_name: Banco do Brasil
        active: true
        pix_key:
          account_preview: jo****ilva****il.c**
          document_number_last4: '8901'
        account_validation:
          validated_account_owner_name: João Silva
          validated_bank_name: Banco do Brasil
        account_owner_type: individual
        first_name: João
        last_name: Silva
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
    SuccessfulBrCodeExternalAccountResponse:
      summary: A successful BR Code External Account object
      value:
        id: ea_456
        customer_id: cust_456
        account_type: pix
        currency: brl
        account_owner_name: Maria Santos
        bank_name: Itaú Unibanco
        active: true
        br_code:
          account_preview: 34****9012****6789****9012
          document_number_last4: '0131'
        account_owner_type: individual
        first_name: Maria
        last_name: Santos
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
    SuccessfulBreBExternalAccountResponse:
      summary: A successful Bre-B External Account object (COP)
      value:
        id: ea_789
        customer_id: cust_789
        account_type: bre_b
        currency: cop
        account_owner_name: Juan Garcia
        bank_name: Banco de Bogota
        active: true
        account:
          last_4: '3456'
        account_owner_type: individual
        first_name: Juan
        last_name: Garcia
        created_at: '2020-01-01T00:00:00.000Z'
        updated_at: '2020-01-02T00:00:00.000Z'
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