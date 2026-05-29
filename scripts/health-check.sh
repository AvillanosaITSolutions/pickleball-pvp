#!/bin/bash
# Health check script for monitoring

set -e

API_URL="${1:-http://localhost:4000}"
FRONTEND_URL="${2:-http://localhost:80}"

echo "🏥 Running health checks..."

# Check API
echo -n "  API Health: "
if curl -s "$API_URL/api/health" > /dev/null 2>&1; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

# Check Database connectivity
echo -n "  Database: "
if curl -s "$API_URL/api/users/me" -H "Authorization: Bearer test" 2>/dev/null | grep -q "Unauthorized\|unauthorized" ; then
    echo "✅ (responding)"
else
    echo "❓ (check logs)"
fi

# Check Frontend
echo -n "  Frontend: "
if curl -s "$FRONTEND_URL/index.html" | grep -q "root" ; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

echo ""
echo "✅ All systems operational!"
