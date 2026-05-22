from .recognition import RecognitionResult, SuggestionCard, SuggestionFilterParams, IdentifyResponse
from .product import ProductItem, PlatformPrices, ProductSearchRequest, ProductSearchResponse
from .filter import FilterParams, NLFilterRequest, NLFilterResponse

# 解析前向引用
IdentifyResponse.model_rebuild()
ProductSearchRequest.model_rebuild()
NLFilterResponse.model_rebuild()
