
location = /ssoshell {
    return 301 /ssoshell/;
}

location ^~ /ssoshell/ {
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;

    include /appbin/sf/nginx/servers/common/PCF_Host.conf;

    set $proxy_pass_url https://shell-sso-ui.app.dev1.use1.pcf.syfbank.com;

    proxy_pass $proxy_pass_url;
}

location ^~ /ssoauth/ {
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;

    include /appbin/sf/nginx/servers/common/PCF_Host.conf;

    set $proxy_pass_url https://shell-sso-service.app.dev1.use1.pcf.syfbank.com;

    proxy_pass $proxy_pass_url;
}
