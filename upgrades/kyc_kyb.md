> ## Documentation Index
> Fetch the complete documentation index at: https://apidocs.bridge.xyz/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a customer



## OpenAPI

````yaml https://withbridge-image1-sv-usw2-monorail-openapi.s3.amazonaws.com/latest.json post /customers
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
  /customers:
    post:
      tags:
        - Customers
      summary: Create a customer
      parameters:
        - $ref: '#/components/parameters/IdempotencyKeyParameter'
      requestBody:
        description: >
          Customer object to be created.


          No fields are strictly required by the API. For example, it is valid
          to create a customer without a first name, last name, or residential
          address, but this customer will not be granted endorsements required
          to transact on Bridge until the necessary information is provided,
          possibly via a PUT request.
        required: true
        content:
          application/json:
            schema:
              oneOf:
                - $ref: '#/components/schemas/CreateIndividualCustomerPayload'
                - $ref: '#/components/schemas/CreateBusinessCustomerPayload'
              discriminator:
                propertyName: type
                mapping:
                  individual:
                    $ref: '#/components/schemas/CreateIndividualCustomerPayload'
                  business:
                    $ref: '#/components/schemas/CreateBusinessCustomerPayload'
      responses:
        '201':
          description: Customer object created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Customer'
              examples:
                IndividualCustomerCreated:
                  $ref: '#/components/examples/SuccessfulCustomerResponse'
                  summary: Customer successfully created
                BusinessCustomerCreated:
                  $ref: '#/components/examples/SuccessfulCustomerResponse2'
                  summary: Customer successfully created
        '400':
          $ref: '#/components/responses/BadRequestError'
        '401':
          $ref: '#/components/responses/AuthenticationError'
        '500':
          $ref: '#/components/responses/UnexpectedError'
components:
  parameters:
    IdempotencyKeyParameter:
      in: header
      name: Idempotency-Key
      required: true
      schema:
        type: string
  schemas:
    CreateIndividualCustomerPayload:
      allOf:
        - $ref: '#/components/schemas/UpdateIndividualCustomerPayload'
        - title: Individual Customer
        - required:
            - type
    CreateBusinessCustomerPayload:
      allOf:
        - $ref: '#/components/schemas/UpdateBusinessCustomerPayload'
        - title: Business Customer
    Customer:
      properties:
        id:
          $ref: '#/components/schemas/Id'
          readOnly: true
        first_name:
          type: string
          minLength: 1
          maxLength: 1024
        last_name:
          type: string
          minLength: 1
          maxLength: 1024
        email:
          type: string
          minLength: 1
          maxLength: 1024
        status:
          $ref: '#/components/schemas/CustomerStatus'
          type: string
        capabilities:
          type: object
          properties:
            payin_crypto:
              $ref: '#/components/schemas/CustomerCapabilityState'
              type: string
            payout_crypto:
              $ref: '#/components/schemas/CustomerCapabilityState'
              type: string
            payin_fiat:
              $ref: '#/components/schemas/CustomerCapabilityState'
              type: string
            payout_fiat:
              $ref: '#/components/schemas/CustomerCapabilityState'
              type: string
        future_requirements_due:
          readOnly: true
          description: >-
            Information about requirements that may be needed in the future for
            the customer (eg. enhanced KYC checks for high volume transactions
            etc.). Please consult our KYC guide on how to resolve each
            requirement.
          type: array
          minItems: 0
          items:
            type: string
            enum:
              - id_verification
        requirements_due:
          readOnly: true
          description: >-
            KYC requirements still needed to be completed. Please consult our
            KYC guide on how to resolve each requirement.
          type: array
          minItems: 0
          items:
            type: string
            enum:
              - external_account
              - id_verification
        created_at:
          readOnly: true
          type: string
          description: Time of creation of the customer
          format: date-time
        updated_at:
          readOnly: true
          type: string
          description: Time of last update of the customer
          format: date-time
        rejection_reasons:
          readOnly: true
          description: Reasons why a customer KYC was rejected
          type: array
          minItems: 0
          items:
            $ref: '#/components/schemas/RejectionReason'
        has_accepted_terms_of_service:
          readOnly: true
          description: Whether the customer has accepted the terms of service.
          type: boolean
        endorsements:
          readOnly: true
          description: >-
            A summary of whether the customer has received approvals to complete
            onboarding or use certain products/services offered by Bridge.
          type: array
          minItems: 0
          items:
            $ref: '#/components/schemas/Endorsement'
    UpdateIndividualCustomerPayload:
      title: Individual Customer
      properties:
        type:
          description: Type of the customer (individual vs. business).
          type: string
          minLength: 1
          enum:
            - individual
        first_name:
          type: string
          minLength: 2
          maxLength: 1024
          description: The first name of the individual.
        middle_name:
          type: string
          minLength: 1
          maxLength: 1024
          description: The middle name of the individual.
        last_name:
          type: string
          minLength: 2
          maxLength: 1024
          description: The last name of the individual.
        transliterated_first_name:
          type: string
          description: >-
            Required when the `first_name` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 256
        transliterated_middle_name:
          type: string
          description: >-
            Required when the `middle_name` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 256
        transliterated_last_name:
          type: string
          description: >-
            Required when the `last_name` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 256
        email:
          type: string
          minLength: 1
          maxLength: 1024
          description: The individuals primary email address
        phone:
          type: string
          minLength: 1
          maxLength: 1024
          description: The individuals primary phone number in format "+12223334444"
        residential_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            The residential address of the individual. This must be a physical
            address, not a PO Box.
        transliterated_residential_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            Required when any part of the `residential_address` includes any non
            Latin-1 characters. Acceptable characters - Latin-1 Unicode
            Character Range: À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
        birth_date:
          type: string
          description: Date of birth in format yyyy-mm-dd. Must be at least 18 years old.
          minLength: 10
          maxLength: 10
        signed_agreement_id:
          writeOnly: true
          type: string
          description: >
            The ID of the signed agreement that the customer completed. You can
            get a signed agreement id for a _new_ customer by following this
            guide
            [here](https://apidocs.bridge.xyz/docs/terms-of-service#tos-acceptance-for-a-new-customer).
          minLength: 1
          maxLength: 1024
        endorsements:
          writeOnly: true
          type: array
          description: >
            List of endorsements to request for this customer. If omitted, we'll
            attempt to grant `base` and `sepa`.
          items:
            $ref: '#/components/schemas/EndorsementType'
        account_purpose:
          type: string
          description: >
            What is the primary purpose of the customer's account?


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/individuals)_
          enum:
            - charitable_donations
            - ecommerce_retail_payments
            - investment_purposes
            - operating_a_company
            - other
            - payments_to_friends_or_family_abroad
            - personal_or_living_expenses
            - protect_wealth
            - purchase_goods_and_services
            - receive_payment_for_freelancing
            - receive_salary
        account_purpose_other:
          type: string
          description: |
            A supplemental description of the `account_purpose`.

            _Required if the `account_purpose` is `other`._
        employment_status:
          type: string
          description: >
            What is the customer's current employment status?


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/individuals)_
          enum:
            - employed
            - homemaker
            - retired
            - self_employed
            - student
            - unemployed
        expected_monthly_payments_usd:
          type: string
          description: >
            What is the expected monthly volume of payments the customer will be
            sending or receiving?


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/individuals)_
          enum:
            - '0_4999'
            - '5000_9999'
            - '10000_49999'
            - 50000_plus
        acting_as_intermediary:
          type: boolean
          description: >
            Is the customer acting as an intermediary for a third party?


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/individuals)_
        most_recent_occupation:
          type: string
          description: >
            What is the customer's most recent occupation? Specify the relevant
            alphanumeric occupation code. See the [list of
            occupations](https://apidocs.bridge.xyz/page/sof-eu-most-recent-occupation-list)
            for the complete list of valid occupations and codes. _Required for
            Restricted countries._


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/individuals)_
        source_of_funds:
          type: string
          description: >
            The individuals source of funds, e.g. government_benefits,
            investments_loans, salary, etc.


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/individuals)_
          enum:
            - company_funds
            - ecommerce_reseller
            - gambling_proceeds
            - gifts
            - government_benefits
            - inheritance
            - investments_loans
            - pension_retirement
            - salary
            - sale_of_assets_real_estate
            - savings
            - someone_elses_funds
        nationality:
          type: string
          description: >-
            The ISO 3166-1 (three-character) country code representing the
            nationality of the customer.
          writeOnly: true
        verified_govid_at:
          type: string
          description: >-
            The timestamp for when individual's government ID was successfully
            verified.
          writeOnly: true
        verified_selfie_at:
          type: string
          description: >-
            The timestamp for when individual's selfie was successfully
            verified.
          writeOnly: true
        completed_customer_safety_check_at:
          type: string
          description: >-
            The timestamp for when individual successfully passed customer
            safety check.
          writeOnly: true
        identifying_information:
          $ref: '#/components/schemas/IdentifyingInformation'
        documents:
          $ref: '#/components/schemas/IndividualDocuments'
    UpdateBusinessCustomerPayload:
      title: Business Customer
      properties:
        type:
          description: Type of the customer (individual vs. business)
          type: string
          minLength: 1
          enum:
            - business
        business_legal_name:
          type: string
          minLength: 1
          maxLength: 1024
          description: >-
            The official registered name of the business as documented with
            government authorities.
        transliterated_business_legal_name:
          type: string
          description: >-
            Required if `business_legal_name` includes any non Latin-1
            characters. Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 1024
        business_trade_name:
          type: string
          minLength: 1
          maxLength: 1024
          description: >-
            The trading name or DBA (Doing Business As) name under which the
            business operates publicly.
        transliterated_business_trade_name:
          type: string
          description: >-
            Required if `business_trade` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 1024
        business_description:
          type: string
          minLength: 1
          maxLength: 1024
          description: A brief summary of the business
        email:
          type: string
          minLength: 1
          maxLength: 1024
          description: The business's primary email address
        business_type:
          description: How the business is legally registered
          type: string
          minLength: 1
          enum:
            - cooperative
            - corporation
            - llc
            - other
            - partnership
            - sole_prop
            - trust
        primary_website:
          type: string
          minLength: 1
          maxLength: 1024
          description: >-
            The business's primary website/web presence. A document with purpose
            'proof_of_nature_of_business' is required if this is not provided
        other_websites:
          type: array
          items:
            type: string
          minLength: 1
          maxLength: 1024
          description: The business's other websites and social media handles
        registered_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: The official registered address of the business.
        transliterated_registered_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            Required if any part of the `registered_address` includes any non
            Latin-1 characters. Acceptable characters - Latin-1 Unicode
            Character Range: À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
        physical_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            The physical address for the primary place of business. This must be
            a physical address and cannot be a PO Box.
        transliterated_physical_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            Required if any part of the `physical_address` includes any non
            Latin-1 characters. Acceptable characters - Latin-1 Unicode
            Character Range: À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
        signed_agreement_id:
          writeOnly: true
          type: string
          description: >
            The ID of the signed agreement that the customer completed. You can
            get a signed agreement id for a _new_ customer by following [this
            guide](https://apidocs.bridge.xyz/docs/terms-of-service#tos-acceptance-for-a-new-customer).
          minLength: 1
          maxLength: 1024
        is_dao:
          type: boolean
          description: >-
            Whether the business is a DAO (Decentralized Autonomous
            Organization)
        compliance_screening_explanation:
          type: string
          description: >-
            Required if `conducts_money_services` is true. A detailed
            description of the business's compliance and anti-money laundering
            controls and practices.
          minLength: 1
          maxLength: 1024
        associated_persons:
          type: array
          description: List of notable people associated with the business such as UBOs.
          items:
            $ref: '#/components/schemas/AssociatedPerson'
        endorsements:
          writeOnly: true
          type: array
          description: >
            List of endorsements to request for this customer. If omitted, we'll
            attempt to grant `base` and `sepa`.
          items:
            $ref: '#/components/schemas/EndorsementType'
        business_industry:
          type: array
          items:
            type: string
          description: >-
            The industry in which this business operates. Click
            [here](https://apidocs.bridge.xyz/page/business-industry-list-updated-2022-naics-codes)
            for the complete list of valid industries and codes.
        publicly_traded_listings:
          writeOnly: true
          type: array
          description: >-
            A list of public exchanges that the company is traded on if
            applicable.
          items:
            type: object
            required:
              - market_identifier_code
              - stock_number
              - ticker
            properties:
              market_identifier_code:
                type: string
                description: >-
                  The 4-digit Market Identifier Code (MIC) (ISO 10383) for the
                  venue where the business is publicly listed and traded.
              stock_number:
                type: string
                description: >-
                  The 12-digit International Securities Identification Number
                  (ISIN) of the company without dashes (-).
              ticker:
                type: string
                description: The ticker for the business's publicly traded listing.
        ownership_threshold:
          type: integer
          description: >-
            The applicable beneficial ownership threshold for the submitted
            `associated_persons` information. Valid values are between 5 to 25.
            Default value is 25.
        has_material_intermediary_ownership:
          type: boolean
          description: >-
            The business has at least one intermediate legal entity owner with
            25% or more ownership
        estimated_annual_revenue_usd:
          type: string
          description: >
            Estimated annual revenue in USD


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
          enum:
            - '0_99999'
            - '100000_999999'
            - '1000000_9999999'
            - '10000000_49999999'
            - '50000000_249999999'
            - 250000000_plus
        expected_monthly_payments_usd:
          type: integer
          description: >
            Expected monthly payments in USD


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
        operates_in_prohibited_countries:
          type: boolean
          description: >
            Does the business operate in any prohibited countries?


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
        account_purpose:
          type: string
          description: What is the primary purpose of the business account?
          enum:
            - charitable_donations
            - ecommerce_retail_payments
            - investment_purposes
            - other
            - payments_to_friends_or_family_abroad
            - payroll
            - personal_or_living_expenses
            - protect_wealth
            - purchase_goods_and_services
            - receive_payments_for_goods_and_services
            - tax_optimization
            - third_party_money_transmission
            - treasury_management
        account_purpose_other:
          type: string
          description: Required if the primary purpose is 'other'.
        high_risk_activities_explanation:
          type: string
          description: >
            An explanation of the high risk activities that the business
            performs. 


            _Required if `high_risk_activities` contains entries other than
            `none_of_the_above`_
        high_risk_activities:
          type: array
          description: >
            List of high-risk activities the business is involved in.


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
          items:
            type: string
            enum:
              - adult_entertainment
              - gambling
              - hold_client_funds
              - investment_services
              - lending_banking
              - marijuana_or_related_services
              - money_services
              - nicotine_tobacco_or_related_services
              - operate_foreign_exchange_virtual_currencies_brokerage_otc
              - pharmaceuticals
              - precious_metals_precious_stones_jewelry
              - safe_deposit_box_rentals
              - third_party_payment_processing
              - weapons_firearms_and_explosives
              - none_of_the_above
        source_of_funds:
          type: string
          description: >-
            The source of funds for the business, e.g. profits, income, venture
            capital, etc.
          enum:
            - business_loans
            - grants
            - inter_company_funds
            - investment_proceeds
            - legal_settlement
            - owners_capital
            - pension_retirement
            - sale_of_assets
            - sales_of_goods_and_services
            - third_party_funds
            - treasury_reserves
        source_of_funds_description:
          type: string
          description: >
            Description of the source of funds for the business' account.


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
        conducts_money_services:
          type: boolean
          description: >
            The business offers money services, investment products, and/or
            other financial services.


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
        conducts_money_services_using_bridge:
          type: boolean
          description: >
            The business plans to conduct money services, investment products,
            and/or other financial services using its Bridge account. A document
            with purpose 'flow_of_funds' is required if this is true.


            _Required if `conducts_money_services` is true_
        conducts_money_services_description:
          type: string
          description: |
            Description of the money services offered by the business.

            _Required if `conducts_money_services` is true_
        identifying_information:
          $ref: '#/components/schemas/IdentifyingInformation'
        documents:
          $ref: '#/components/schemas/BusinessDocuments'
        regulated_activity:
          type: object
          required:
            - regulated_activities_description
            - primary_regulatory_authority_country
            - primary_regulatory_authority_name
            - license_number
          properties:
            regulated_activities_description:
              type: string
              description: >-
                A detailed description of the regulated activities the business
                is licensed to conduct.
            primary_regulatory_authority_country:
              type: string
              description: The ISO 3166-1 (three-character) country code.
            primary_regulatory_authority_name:
              type: string
              description: >-
                The name of the primary regulatory authority that oversees the
                business's regulated activities.
            license_number:
              type: string
              description: >-
                The license number or registration number assigned by the
                business's primary regulator.
        acting_as_intermediary:
          type: boolean
          description: >
            Is the customer acting as an intermediary for a third party?


            _Required for high risk customers. More information found
            [here](https://apidocs.bridge.xyz/docs/business-accounts)_
    Id:
      description: A UUID that uniquely identifies a resource
      type: string
      pattern: '[a-z0-9]*'
      minLength: 1
      maxLength: 42
    CustomerStatus:
      type: string
      description: >
        `offboarded`: represents a customer's account that was internally
        reviewed and closed due to suspicious activity.

        `paused`: represents a customer's account that is currently under review
        because of activity on the platform.
      enum:
        - active
        - awaiting_questionnaire
        - awaiting_ubo
        - incomplete
        - not_started
        - offboarded
        - paused
        - rejected
        - under_review
    CustomerCapabilityState:
      type: string
      description: State of the customer capability
      enum:
        - pending
        - active
        - inactive
        - rejected
    RejectionReason:
      description: Reason why the kyc_status was rejected
      properties:
        developer_reason:
          type: string
          description: >-
            Developer information for why a customer was rejected. Not to be
            shared with the customer.
        reason:
          type: string
          description: >-
            Reason for why a customer was rejected. To be shared with the
            customer.
        created_at:
          type: string
          description: Time of creation of the rejection reason
    Endorsement:
      required:
        - name
        - status
      properties:
        name:
          $ref: '#/components/schemas/EndorsementType'
          description: The endorsement type.
        status:
          type: string
          enum:
            - incomplete
            - approved
            - revoked
        additional_requirements:
          description: >-
            This field is deprecated. See endorsement.missing instead.
            Additional requirements that need to be completed for obtaining the
            approval for the endorsement. 


            1. `kyc_approval` and `tos_acceptance` are required for the `base`
            endorsement. 

            2. `tos_v2_acceptance` is required for `sepa`. If
            `tos_v2_acceptance` is not completed, a ToS acceptance link can be
            retrieved for the current customer from the endpoint
            `/v0/customers/{customerID}/tos_acceptance_link`. To fulfill the
            `kyc_with_proof_of_address` requirement, a KYC link can be
            specifically requested for the current customer via the endpoint
            `/v0/customers/{customerID}/kyc_link`, with `endorsement=sepa`
            included in the query string
          type: array
          minItems: 0
          items:
            $ref: '#/components/schemas/EndorsementRequirementEnum'
        requirements:
          description: >
            This object aims to replace the `additional_requirements` attribute
            as it gives a more comprehensive view into what items are already
            `complete` or `pending` and which are `missing` or have `issues`.
          type: object
          required:
            - complete
            - pending
            - missing
            - issues
          properties:
            complete:
              type: array
              description: >-
                an array of requirements that have already been completed for
                this endorsement.
              minItems: 0
              items:
                type: string
            pending:
              type: array
              description: >-
                an array of requirements that are pending review for this
                endorsement.
              minItems: 0
              items:
                type: string
            missing:
              type: object
              description: >-
                an object that will specify an indepth breakdown of what items
                are missing for this endorsement.
            issues:
              type: array
              description: >
                An array of issues preventing this endorsement from being
                approved. Values in this array can be either a string such as
                `endorsement_not_available_in_customers_region` or an object
                that correlates the issue to a particular field such as `{
                id_front_photo: "id_expired" }`
              minItems: 0
              items:
                oneOf:
                  - type: string
                  - type: object
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
    Address2025WinterRefresh:
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
        subdivision:
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
    EndorsementType:
      description: The type of endorsement.
      type: string
      enum:
        - base
        - cards
        - cop
        - faster_payments
        - pix
        - sepa
        - spei
    IdentifyingInformation:
      writeOnly: true
      type: array
      title: Identification Information
      items:
        type: object
        required:
          - issuing_country
          - type
        properties:
          type:
            type: string
            description: >
              The `type` provided determines whether you are submitting a tax
              identification number or some form of government-issued ID.


              Reference these lists for tax identification numbers by country:
              [Individuals](https://apidocs.bridge.xyz/docs/individual-tax-identification-numbers-by-country),
              [Businesses](https://apidocs.bridge.xyz/docs/business-tax-identification-numbers-by-country)


              Here is the list of acceptable government issued id documents:
              `drivers_license`, `matriculate_id`, `military_id`,
              `permanent_residency_id`, `state_or_provincial_id`, `visa`,
              `national_id`, `passport`


              All customers must provide at least one Tax Identification Number
              for their issuing country. If a country cannot be found, please
              select `other` and ensure the `description` field is provided.


              Non-U.S. `individual` customers and associated persons must
              include a combination of at least one Tax Identification Number
              and at least one photo id document such as a `passport` (with
              `image_front`) or a government-issued `drivers_license`. If the
              photo id document used is also a valid tax identification number
              (like a national id), it can be submitted as a single object in
              the `identifying_information` array; otherwise, a valid tax
              identification number must also be submitted as a separate object
              in the `identifying_information` array.
            enum:
              - drivers_license
              - matriculate_id
              - military_id
              - national_id
              - passport
              - permanent_residency_id
              - state_or_provincial_id
              - visa
              - abn
              - acn
              - ahv
              - ak
              - aom
              - arbn
              - avs
              - bc
              - bce
              - bin
              - bir
              - bp
              - brn
              - bsn
              - bvn
              - cc
              - cdi
              - cedula_juridica
              - cf
              - cif
              - cin
              - cipc
              - cn
              - cnp
              - cnpj
              - cpf
              - cpr
              - crc
              - crib
              - crn
              - cro
              - cui
              - cuil
              - curp
              - cuit
              - cvr
              - edrpou
              - ein
              - embg
              - emirates_id
              - en
              - fin
              - fn
              - gstin
              - gui
              - hetu
              - hkid
              - hn
              - ic
              - ico
              - id
              - id_broj
              - idno
              - idnp
              - idnr
              - if
              - iin
              - ik
              - inn
              - ird
              - itin
              - itr
              - iva
              - jmbg
              - kbo
              - kvk
              - matricule
              - mf
              - mn
              - ms
              - mst
              - nic
              - nicn
              - nie
              - nif
              - nin
              - nino
              - nip
              - nipc
              - nipt
              - nit
              - npwp
              - nric
              - nrn
              - nrt
              - ntn
              - nuit
              - nzbn
              - oib
              - orgnr
              - other
              - pan
              - partita_iva
              - pesel
              - pib
              - pin
              - pk
              - ppsn
              - qid
              - rc
              - regon
              - rfc
              - ricn
              - rif
              - rn
              - rnc
              - rnokpp
              - rp
              - rrn
              - rtn
              - ruc
              - rut
              - si
              - sin
              - siren
              - siret
              - spi
              - ssm
              - ssn
              - steuer_id
              - strn
              - tckn
              - tfn
              - tin
              - tpin
              - trn
              - ucn
              - uen
              - uic
              - uid
              - usc
              - ust_idnr
              - utr
              - vat
              - vkn
              - voen
              - y_tunnus
          issuing_country:
            type: string
            description: >-
              The ISO 3166-1 (three-character) country code that issued the
              provided document.
          number:
            type: string
            description: >-
              The unique identifier of the document. Required if this document
              is being used as a tax identification number (e.g., you are
              providing a passport or national_id with no other identification).
          description:
            type: string
            description: >-
              A description describing the provided document. This field is
              required when `other` is selected.
          expiration:
            type: string
            description: The expiration date of the given document in yyyy-mm-dd format.
          image_front:
            type: string
            description: >
              This field is optionally accepted for tax_id types, but required
              for government_id types. Base64 encoded image* of the front side
              of the provided document, following the data-uri scheme i.e.
              data:image/[type];base64,[base_64_encoded_file_contents], with a
              minimum size of 200px x 200px \n\n*Maximum File Size:
              15MB\n\n*Valid file types: .pdf, .jpeg, .jpg, .png, .heic, .tif


              _Note: When combined with an `image_back`, the combined size of
              both images must not exceed 24MB._
          image_back:
            type: string
            description: >
              Base64 encoded image* of the back side of the provided document,
              following the data-uri scheme i.e.
              data:image/[type];base64,[base_64_encoded_file_contents], with a
              minimum size of 200px x 200px \n\n*Maximum File Size:
              15MB\n\n*Valid file types: .pdf, .jpeg, .jpg, .png, .heic, .tif


              _Note: When combined with an `image_front`, the combined size of
              both images must not exceed 24MB._
    IndividualDocuments:
      writeOnly: true
      type: array
      title: Documents
      description: Please click "ADD OBJECT" for more information.
      items:
        type: object
        required:
          - purposes
          - file
        properties:
          purposes:
            type: array
            items:
              type: string
              enum:
                - proof_of_account_purpose
                - proof_of_address
                - proof_of_individual_name_change
                - proof_of_relationship
                - proof_of_source_of_funds
                - proof_of_source_of_wealth
                - proof_of_tax_identification
                - other
            description: >-
              A list of purposes that the given document serves. Click "ADD
              STRING" to see common document purposes for individuals, or view
              the full list of possible values
              [here](https://apidocs.bridge.xyz/docs/supported-documents).
          file:
            type: string
            description: >-
              Base64 encoded image* of the provided document, following the
              data-uri scheme i.e.
              data:image/[type];base64,[base_64_encoded_file_contents], with a
              minimum size of 200px x 200px 


              *Maximum File Size: 24MB


              *Valid file types: .pdf, .jpeg, .jpg, .png, .heic, .tif
          description:
            type: string
            description: >-
              A description describing the provided document. This field is
              required when `other` is provided as one of the purposes.
    AssociatedPerson:
      required:
        - first_name
        - last_name
        - email
        - residential_address
        - identifying_information
        - birth_date
        - has_ownership
        - has_control
        - is_signer
      properties:
        first_name:
          type: string
          minLength: 1
          maxLength: 1024
          description: The first name of the associated person
        middle_name:
          type: string
          minLength: 1
          maxLength: 1024
          description: The middle name of the associated person
        last_name:
          type: string
          minLength: 2
          maxLength: 1024
          description: The last name of the associated person
        transliterated_first_name:
          type: string
          description: >-
            Required when the `first_name` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 256
        transliterated_middle_name:
          type: string
          description: >-
            Required when the `middle_name` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 256
        transliterated_last_name:
          type: string
          description: >-
            Required when the `last_name` includes any non Latin-1 characters.
            Acceptable characters - Latin-1 Unicode Character Range:
            À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
          minLength: 1
          maxLength: 256
        email:
          type: string
          minLength: 1
          maxLength: 1024
          description: The persons primary email address
        phone:
          description: The persons phone in format "+12223334444"
          type: string
          minLength: 1
          maxLength: 1024
        residential_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            The residential address of the associated person. This must be a
            physical address and cannot be a PO Box.
        transliterated_residential_address:
          $ref: '#/components/schemas/Address2025WinterRefresh'
          writeOnly: true
          description: >-
            Required when any part of the `residential_address` includes any non
            Latin-1 characters. Acceptable characters - Latin-1 Unicode
            Character Range: À-ÖØ-ßà-öø-ÿ; Standard Unicode Character Range:  -~
        birth_date:
          type: string
          description: Date of birth in format yyyy-mm-dd. Must be at least 18 years old.
          minLength: 10
          maxLength: 10
        has_ownership:
          type: boolean
          description: True if this person has at least 25% ownership of the business.
        has_control:
          type: boolean
          description: >-
            True if this is the control person of the company, having
            significant responsibility to control, manage or influence the
            activities of the business entity. At least one control person must
            be specified. 
        is_signer:
          type: boolean
          description: >-
            True if this person is able to authorize transactions on behalf of
            the business. At least one signer must be specified.
        is_director:
          type: boolean
          description: True if this person is an appointed director of the company.
        title:
          type: string
          description: >-
            The title of this associated person at the company, e.g. CEO, CFO,
            etc. Required if has_control is true.
          minLength: 1
          maxLength: 1024
        ownership_percentage:
          type: integer
          description: Ultimate ownership percentage of the business.
          writeOnly: true
        attested_ownership_structure_at:
          type: string
          description: >-
            The date or timestamp when this individual attested to the
            correctness of the ownership structure provided to Bridge. If
            provided by at least one control person, ownership documents for the
            business are not required.
          writeOnly: true
        relationship_established_at:
          type: string
          description: >-
            The date or timestamp when the associated person relationship was
            established in format yyyy-mm-dd.
        verified_govid_at:
          type: string
          description: >-
            The date or timestamp for when individual's government ID was
            successfully verified.
          writeOnly: true
        verified_selfie_at:
          type: string
          description: >-
            The date or timestamp for when individual's selfie was successfully
            verified.
          writeOnly: true
        completed_customer_safety_check_at:
          type: string
          description: >-
            The date or timestamp for when individual successfully passed
            customer safety check.
          writeOnly: true
        identifying_information:
          $ref: '#/components/schemas/IdentifyingInformation'
        documents:
          $ref: '#/components/schemas/IndividualDocuments'
    BusinessDocuments:
      writeOnly: true
      type: array
      title: Documents
      description: Please click "ADD OBJECT" for more information.
      items:
        type: object
        required:
          - purposes
          - file
        properties:
          purposes:
            type: array
            items:
              type: string
              enum:
                - aml_comfort_letter
                - business_formation
                - directors_registry
                - e_signature_certificate
                - evidence_of_good_standing
                - flow_of_funds
                - marketing_materials
                - ownership_chart
                - ownership_information
                - proof_of_account_purpose
                - proof_of_address
                - proof_of_entity_name_change
                - proof_of_nature_of_business
                - proof_of_signatory_authority
                - proof_of_source_of_funds
                - proof_of_source_of_wealth
                - proof_of_tax_identification
                - shareholder_register
                - other
            description: >
              A list of purposes that the given document serves. Click "ADD
              STRING" to see common document purposes for businesses, or view
              the full list of possible values
              [here](https://apidocs.bridge.xyz/docs/supported-documents).


              `business_formation` and `ownership_information` documents are
              required for businesses, except for sole proprietorships.
          file:
            type: string
            description: >-
              Base64 encoded image of the provided document, following the
              data-uri scheme i.e.
              data:image/[type];base64,[base_64_encoded_file_contents], with a
              minimum size of 200px x 200px 


              *Maximum File Size: 24MB


              *Valid file types: .pdf, .jpeg, .jpg, .png, .heic, .tif
          description:
            type: string
            description: >-
              A description describing the provided document. This field is
              required when `other` is provided as one of the purposes.
    EndorsementRequirementEnum:
      type: string
      enum:
        - kyc_approval
        - tos_acceptance
        - kyc_with_proof_of_address
        - tos_v2_acceptance
  examples:
    SuccessfulCustomerResponse:
      summary: An individual customer object
      value:
        id: 00000000-0000-0000-0000-000000000000
        first_name: John
        last_name: Doe
        email: johndoe@example.com
        status: active
        type: individual
        persona_inquiry_type: gov_id_db
        created_at: '2025-11-19T21:14:58.328Z'
        updated_at: '2025-11-19T21:16:02.894Z'
        rejection_reasons: []
        has_accepted_terms_of_service: true
        endorsements:
          - name: base
            status: approved
            requirements:
              complete:
                - terms_of_service_v1
                - first_name
                - last_name
                - tax_identification_number
                - email_address
                - address_of_residence
                - date_of_birth
                - proof_of_address
                - sanctions_screen
                - pep_screen
                - blocklist_lookup
                - min_age_18
                - selfie_verification
                - government_id_rejection_checks_passed
                - government_id_review_checks_passed
                - government_id_reliance
                - post_processing
              pending: []
              missing: null
              issues: []
          - name: sepa
            status: approved
            requirements:
              complete:
                - terms_of_service_v2
                - first_name
                - last_name
                - tax_identification_number
                - email_address
                - address_of_residence
                - date_of_birth
                - proof_of_address
                - sanctions_screen
                - pep_screen
                - blocklist_lookup
                - min_age_18
                - selfie_verification
                - government_id_rejection_checks_passed
                - government_id_review_checks_passed
                - government_id_reliance
              pending: []
              missing: null
              issues: []
        future_requirements_due: []
        requirements_due:
          - external_account
        capabilities:
          payin_crypto: active
          payout_crypto: active
          payin_fiat: pending
          payout_fiat: pending
    SuccessfulCustomerResponse2:
      summary: A business customer object
      value:
        id: 00000000-0000-0000-0000-000000000000
        first_name: Acme Corporation
        last_name: null
        email: business@example.com
        status: active
        type: business
        persona_inquiry_type: business
        created_at: '2025-11-19T04:41:33.296Z'
        updated_at: '2025-11-19T19:10:39.393Z'
        rejection_reasons: []
        has_accepted_terms_of_service: true
        endorsements:
          - name: base
            status: approved
            requirements:
              complete:
                - terms_of_service_v1
                - business_name
                - business_type
                - business_description
                - is_dao
                - email_address
                - address_of_incorporation
                - address_of_operation
                - tax_identification_number
                - business_industry
                - control_person_ownership_attestation
                - minimal_source_of_funds_data
                - proof_of_address
                - adverse_media_screen
                - sanctions_screen
                - manual_business_ein_verification_review
                - manual_business_registry_verification_review
                - business_website
                - manual_business_website_verification_review
                - business_formation_document_verification
                - manual_business_formation_document_verification_review
                - kyb_review
                - associated_person: 11111111-1111-1111-1111-111111111111
                  items:
                    - has_control
                    - first_name
                    - last_name
                    - email_address
                    - address_of_residence
                    - associated_person_relationship
                    - date_of_birth
                    - tax_identification_number
                    - manual_government_id_review
                    - sanctions_screen
                    - adverse_media_screen
                    - pep_screen
                    - min_age_18
                    - selfie_verification
                    - has_title
              pending: []
              missing: null
              issues: []
          - name: sepa
            status: approved
            requirements:
              complete:
                - terms_of_service_v2
                - business_name
                - business_type
                - business_description
                - is_dao
                - email_address
                - address_of_incorporation
                - address_of_operation
                - tax_identification_number
                - business_industry
                - control_person_ownership_attestation
                - minimal_source_of_funds_data
                - proof_of_address
                - adverse_media_screen
                - sanctions_screen
                - manual_business_ein_verification_review
                - manual_business_registry_verification_review
                - business_website
                - manual_business_website_verification_review
                - business_formation_document_verification
                - manual_business_formation_document_verification_review
                - kyb_review
                - associated_person: 11111111-1111-1111-1111-111111111111
                  items:
                    - has_control
                    - first_name
                    - last_name
                    - email_address
                    - address_of_residence
                    - associated_person_relationship
                    - date_of_birth
                    - tax_identification_number
                    - manual_government_id_review
                    - sanctions_screen
                    - adverse_media_screen
                    - pep_screen
                    - min_age_18
                    - selfie_verification
                    - has_title
              pending: []
              missing: null
              issues: []
        future_requirements_due: []
        requirements_due:
          - external_account
        capabilities:
          payin_crypto: active
          payout_crypto: active
          payin_fiat: pending
          payout_fiat: pending
        associated_persons:
          - id: 11111111-1111-1111-1111-111111111111
            email: person@example.com
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