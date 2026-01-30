"""OpenAPI specification loader and parser."""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import yaml

from contractshield.core.errors import ConfigurationError


@dataclass
class OperationSchema:
    """Schema for a single HTTP operation (GET, POST, etc.)."""

    operation_id: Optional[str] = None
    summary: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    parameters: List[Dict[str, Any]] = field(default_factory=list)
    request_body: Optional[Dict[str, Any]] = None
    responses: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    security: Optional[List[Dict[str, List[str]]]] = None
    deprecated: bool = False

    @property
    def request_schema(self) -> Optional[Dict[str, Any]]:
        """Get the request body JSON schema (for application/json)."""
        if not self.request_body:
            return None

        content = self.request_body.get("content", {})
        json_content = content.get("application/json", {})
        return json_content.get("schema")

    def response_schema(self, status_code: str = "200") -> Optional[Dict[str, Any]]:
        """Get the response JSON schema for a given status code."""
        response = self.responses.get(status_code, {})
        content = response.get("content", {})
        json_content = content.get("application/json", {})
        return json_content.get("schema")


@dataclass
class RouteSchema:
    """Schema for a route path with all its operations."""

    path: str
    path_pattern: re.Pattern
    path_params: List[str]
    operations: Dict[str, OperationSchema] = field(default_factory=dict)

    def match(self, request_path: str) -> Optional[Dict[str, str]]:
        """
        Match a request path against this route.

        Returns path parameters if matched, None otherwise.
        """
        match = self.path_pattern.match(request_path)
        if not match:
            return None
        return match.groupdict()

    def get_operation(self, method: str) -> Optional[OperationSchema]:
        """Get operation schema for a given HTTP method."""
        return self.operations.get(method.lower())


@dataclass
class OpenAPISpec:
    """Parsed OpenAPI specification."""

    version: str
    title: str
    description: Optional[str]
    servers: List[Dict[str, Any]]
    routes: Dict[str, RouteSchema]
    components: Dict[str, Any]
    security: Optional[List[Dict[str, List[str]]]]
    tags: List[Dict[str, Any]]

    def find_route(self, path: str) -> Optional[Tuple[RouteSchema, Dict[str, str]]]:
        """
        Find a route that matches the given path.

        Returns (RouteSchema, path_params) if found, None otherwise.
        """
        for route in self.routes.values():
            params = route.match(path)
            if params is not None:
                return route, params
        return None

    def get_operation(
        self, path: str, method: str
    ) -> Optional[Tuple[OperationSchema, Dict[str, str]]]:
        """
        Get operation schema for a path and method.

        Returns (OperationSchema, path_params) if found, None otherwise.
        """
        result = self.find_route(path)
        if not result:
            return None

        route, params = result
        operation = route.get_operation(method)
        if not operation:
            return None

        return operation, params


class OpenAPILoader:
    """
    OpenAPI specification loader.

    Loads and parses OpenAPI 3.x specifications from YAML or JSON files.
    """

    HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}

    def __init__(self, resolve_refs: bool = True):
        """
        Initialize the loader.

        Args:
            resolve_refs: Whether to resolve $ref references inline
        """
        self.resolve_refs = resolve_refs
        self._spec_cache: Dict[str, Dict[str, Any]] = {}

    def load(self, path: Union[str, Path]) -> OpenAPISpec:
        """
        Load an OpenAPI specification from a file.

        Args:
            path: Path to the OpenAPI YAML or JSON file

        Returns:
            Parsed OpenAPI specification

        Raises:
            ConfigurationError: If the file is invalid or cannot be parsed
        """
        path = Path(path)

        if not path.exists():
            raise ConfigurationError(f"OpenAPI spec file not found: {path}")

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            # Parse YAML (also handles JSON)
            raw_spec = yaml.safe_load(content)

            if not isinstance(raw_spec, dict):
                raise ConfigurationError(f"Invalid OpenAPI spec format: {path}")

            # Cache the raw spec for $ref resolution
            self._spec_cache[str(path)] = raw_spec

            return self._parse_spec(raw_spec, str(path))

        except yaml.YAMLError as e:
            raise ConfigurationError(f"Failed to parse OpenAPI spec: {e}") from e

    def load_from_dict(self, spec: Dict[str, Any]) -> OpenAPISpec:
        """
        Load an OpenAPI specification from a dictionary.

        Args:
            spec: OpenAPI specification as a dictionary

        Returns:
            Parsed OpenAPI specification
        """
        self._spec_cache["inline"] = spec
        return self._parse_spec(spec, "inline")

    def _parse_spec(self, spec: Dict[str, Any], source: str) -> OpenAPISpec:
        """Parse raw OpenAPI specification."""
        # Validate OpenAPI version
        openapi_version = spec.get("openapi", "")
        if not openapi_version.startswith("3."):
            raise ConfigurationError(
                f"Unsupported OpenAPI version: {openapi_version}. Only 3.x is supported."
            )

        info = spec.get("info", {})
        title = info.get("title", "Untitled API")
        description = info.get("description")

        servers = spec.get("servers", [])
        components = spec.get("components", {})
        security = spec.get("security")
        tags = spec.get("tags", [])

        # Parse paths
        paths = spec.get("paths", {})
        routes: Dict[str, RouteSchema] = {}

        for path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue

            route = self._parse_path(path, path_item, components, source)
            routes[path] = route

        return OpenAPISpec(
            version=openapi_version,
            title=title,
            description=description,
            servers=servers,
            routes=routes,
            components=components,
            security=security,
            tags=tags,
        )

    def _parse_path(
        self,
        path: str,
        path_item: Dict[str, Any],
        components: Dict[str, Any],
        source: str,
    ) -> RouteSchema:
        """Parse a path item into a RouteSchema."""
        # Convert OpenAPI path to regex pattern
        path_pattern, path_params = self._path_to_regex(path)

        operations: Dict[str, OperationSchema] = {}

        # Path-level parameters
        path_parameters = path_item.get("parameters", [])

        for method in self.HTTP_METHODS:
            if method not in path_item:
                continue

            operation_data = path_item[method]
            if not isinstance(operation_data, dict):
                continue

            operation = self._parse_operation(
                operation_data, path_parameters, components, source
            )
            operations[method] = operation

        return RouteSchema(
            path=path,
            path_pattern=path_pattern,
            path_params=path_params,
            operations=operations,
        )

    def _parse_operation(
        self,
        operation_data: Dict[str, Any],
        path_parameters: List[Dict[str, Any]],
        components: Dict[str, Any],
        source: str,
    ) -> OperationSchema:
        """Parse an operation into an OperationSchema."""
        # Merge path-level and operation-level parameters
        operation_params = operation_data.get("parameters", [])
        all_params = path_parameters + operation_params

        # Resolve $ref in parameters if needed
        if self.resolve_refs:
            all_params = [
                self._resolve_ref(p, components, source) for p in all_params
            ]

        # Parse request body
        request_body = operation_data.get("requestBody")
        if request_body and self.resolve_refs:
            request_body = self._resolve_ref(request_body, components, source)

        # Parse responses
        responses = operation_data.get("responses", {})
        if self.resolve_refs:
            responses = {
                code: self._resolve_ref(resp, components, source)
                for code, resp in responses.items()
            }

        return OperationSchema(
            operation_id=operation_data.get("operationId"),
            summary=operation_data.get("summary"),
            description=operation_data.get("description"),
            tags=operation_data.get("tags", []),
            parameters=all_params,
            request_body=request_body,
            responses=responses,
            security=operation_data.get("security"),
            deprecated=operation_data.get("deprecated", False),
        )

    def _path_to_regex(self, path: str) -> Tuple[re.Pattern, List[str]]:
        """
        Convert an OpenAPI path template to a regex pattern.

        Args:
            path: OpenAPI path like /users/{userId}/posts/{postId}

        Returns:
            Tuple of (compiled pattern, list of parameter names)
        """
        params: List[str] = []

        # Find all {param} patterns
        param_pattern = re.compile(r"\{([^}]+)\}")

        def replace_param(match: re.Match) -> str:
            param_name = match.group(1)
            params.append(param_name)
            # Match any non-slash characters
            return f"(?P<{param_name}>[^/]+)"

        # Escape special regex characters (except { and })
        escaped_path = path
        for char in r"\.+*?^$[]|()":
            escaped_path = escaped_path.replace(char, f"\\{char}")

        # Replace path parameters
        regex_path = param_pattern.sub(replace_param, escaped_path)

        # Anchor the pattern
        regex_path = f"^{regex_path}$"

        return re.compile(regex_path), params

    def _resolve_ref(
        self, obj: Any, components: Dict[str, Any], source: str
    ) -> Any:
        """
        Resolve $ref references in an object.

        Only handles local references (#/components/...).
        """
        if not isinstance(obj, dict):
            return obj

        if "$ref" in obj:
            ref = obj["$ref"]
            if ref.startswith("#/"):
                # Local reference
                resolved = self._get_ref_value(ref, source)
                if resolved:
                    # Recursively resolve nested refs
                    return self._resolve_ref(resolved, components, source)
            return obj

        # Recursively resolve refs in nested objects
        result = {}
        for key, value in obj.items():
            if isinstance(value, dict):
                result[key] = self._resolve_ref(value, components, source)
            elif isinstance(value, list):
                result[key] = [
                    self._resolve_ref(item, components, source)
                    if isinstance(item, dict)
                    else item
                    for item in value
                ]
            else:
                result[key] = value

        return result

    def _get_ref_value(self, ref: str, source: str) -> Optional[Dict[str, Any]]:
        """Get the value referenced by a $ref string."""
        if not ref.startswith("#/"):
            return None

        spec = self._spec_cache.get(source)
        if not spec:
            return None

        # Parse the JSON pointer
        path_parts = ref[2:].split("/")
        current = spec

        for part in path_parts:
            # Unescape JSON pointer encoding
            part = part.replace("~1", "/").replace("~0", "~")
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None

        return current if isinstance(current, dict) else None
