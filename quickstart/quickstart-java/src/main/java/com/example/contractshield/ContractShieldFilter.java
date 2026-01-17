package com.example.contractshield;

import javax.servlet.*;
import javax.servlet.http.*;
import java.io.IOException;

public class ContractShieldFilter implements Filter {

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        // Mock identity context
        String tenant = "tenant-1";
        String bodyTenant = request.getParameter("tenantId");

        if (!tenant.equals(bodyTenant)) {
            response.setStatus(403);
            response.getWriter().write("{\"action\":\"BLOCK\",\"rule\":\"tenant.binding\"}");
            return;
        }

        chain.doFilter(req, res);
    }
}
