"""
OpenAPI validation example with ContractShield.

This example shows how to use OpenAPI specification for request/response validation.
"""

import tempfile
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

from contractshield.fastapi import (
    ContractShieldMiddleware,
    ContractShieldConfig,
)
from contractshield.openapi import OpenAPILoader

# Sample OpenAPI specification
OPENAPI_SPEC = """
openapi: 3.0.3
info:
  title: Product API
  version: 1.0.0
paths:
  /products:
    post:
      operationId: createProduct
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - name
                - price
              properties:
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
                price:
                  type: number
                  minimum: 0
                description:
                  type: string
                  maxLength: 1000
      responses:
        '201':
          description: Product created
  /products/{productId}:
    get:
      operationId: getProduct
      parameters:
        - name: productId
          in: path
          required: true
          schema:
            type: string
            pattern: '^[a-zA-Z0-9-]+$'
      responses:
        '200':
          description: Success
"""


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(title="Product API")

    # Write OpenAPI spec to temp file
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".yaml", delete=False
    ) as f:
        f.write(OPENAPI_SPEC)
        spec_path = f.name

    # Add ContractShield middleware with OpenAPI validation
    app.add_middleware(
        ContractShieldMiddleware,
        config=ContractShieldConfig(
            # Enable OpenAPI validation
            openapi_path=spec_path,
            validate_request=True,

            # Also enable vulnerability scanning
            enable_vulnerability_scan=True,

            mode="enforce",
            log_decisions=True,
        ),
    )

    return app


app = create_app()


class ProductCreate(BaseModel):
    name: str
    price: float
    description: str | None = None


class Product(BaseModel):
    id: str
    name: str
    price: float
    description: str | None = None


@app.post("/products", response_model=Product, status_code=201)
async def create_product(product: ProductCreate):
    """
    Create a new product.

    ContractShield validates the request against the OpenAPI schema:
    - name: required, 1-100 characters
    - price: required, must be >= 0
    - description: optional, max 1000 characters

    Invalid requests will be rejected with a 403 status.
    """
    return Product(
        id="prod-123",
        name=product.name,
        price=product.price,
        description=product.description,
    )


@app.get("/products/{product_id}")
async def get_product(product_id: str):
    """
    Get a product by ID.

    The productId must match the pattern ^[a-zA-Z0-9-]+$
    """
    return {
        "id": product_id,
        "name": "Example Product",
        "price": 99.99,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
