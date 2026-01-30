"""Tests for OpenAPI specification loading."""

import pytest
import tempfile
import os

from contractshield.openapi import OpenAPILoader, OpenAPISpec


SAMPLE_OPENAPI = """
openapi: 3.0.3
info:
  title: Test API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/User'
    post:
      operationId: createUser
      summary: Create a user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUser'
      responses:
        '201':
          description: Created
  /users/{userId}:
    get:
      operationId: getUser
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Success
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
          format: email
    CreateUser:
      type: object
      required:
        - name
        - email
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 100
        email:
          type: string
          format: email
"""


class TestOpenAPILoader:
    """Test OpenAPI specification loading."""

    def test_load_from_file(self):
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".yaml", delete=False
        ) as f:
            f.write(SAMPLE_OPENAPI)
            f.flush()

            try:
                loader = OpenAPILoader()
                spec = loader.load(f.name)

                assert spec.title == "Test API"
                assert spec.version.startswith("3.0")
                assert len(spec.routes) == 2
            finally:
                os.unlink(f.name)

    def test_load_from_dict(self):
        import yaml

        data = yaml.safe_load(SAMPLE_OPENAPI)
        loader = OpenAPILoader()
        spec = loader.load_from_dict(data)

        assert spec.title == "Test API"
        assert "/users" in spec.routes
        assert "/users/{userId}" in spec.routes

    def test_route_matching(self):
        import yaml

        data = yaml.safe_load(SAMPLE_OPENAPI)
        loader = OpenAPILoader()
        spec = loader.load_from_dict(data)

        # Test exact path match
        result = spec.find_route("/users")
        assert result is not None
        route, params = result
        assert route.path == "/users"
        assert params == {}

        # Test path parameter match
        result = spec.find_route("/users/123")
        assert result is not None
        route, params = result
        assert route.path == "/users/{userId}"
        assert params == {"userId": "123"}

        # Test no match
        result = spec.find_route("/invalid")
        assert result is None

    def test_get_operation(self):
        import yaml

        data = yaml.safe_load(SAMPLE_OPENAPI)
        loader = OpenAPILoader()
        spec = loader.load_from_dict(data)

        # Test GET /users
        result = spec.get_operation("/users", "GET")
        assert result is not None
        operation, params = result
        assert operation.operation_id == "listUsers"

        # Test POST /users
        result = spec.get_operation("/users", "POST")
        assert result is not None
        operation, params = result
        assert operation.operation_id == "createUser"
        assert operation.request_schema is not None

        # Test method not found
        result = spec.get_operation("/users", "DELETE")
        assert result is None

    def test_request_schema_resolution(self):
        import yaml

        data = yaml.safe_load(SAMPLE_OPENAPI)
        loader = OpenAPILoader(resolve_refs=True)
        spec = loader.load_from_dict(data)

        result = spec.get_operation("/users", "POST")
        assert result is not None
        operation, _ = result

        schema = operation.request_schema
        assert schema is not None
        assert schema.get("type") == "object"
        assert "name" in schema.get("properties", {})
        assert "email" in schema.get("properties", {})

    def test_path_parameter_extraction(self):
        import yaml

        data = yaml.safe_load(SAMPLE_OPENAPI)
        loader = OpenAPILoader()
        spec = loader.load_from_dict(data)

        route = spec.routes.get("/users/{userId}")
        assert route is not None
        assert "userId" in route.path_params

    def test_invalid_openapi_version(self):
        from contractshield.core.errors import ConfigurationError

        loader = OpenAPILoader()
        with pytest.raises(ConfigurationError):
            loader.load_from_dict({"openapi": "2.0.0", "info": {"title": "Test"}})
