export type Service = {
	name: string;
	local: string;
	output: string;
	orvalKey: string;
};

export const services: Service[] = [
	{
		name: "cloud-storage",
		local: "http://localhost:8086/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-storage/",
		orvalKey: "storageService",
	},
	{
		name: "properties-service",
		local: "http://localhost:8086/properties/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-properties/",
		orvalKey: "propertiesService",
	},
	{
		name: "document-cognition",
		local: "http://localhost:8085/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-cognition/",
		orvalKey: "cognitionService",
	},
	{
		name: "auth-service",
		local: "http://localhost:8080/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-auth/",
		orvalKey: "authService",
	},
	{
		name: "notification-service",
		local: "http://localhost:8089/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-notification/",
		orvalKey: "notificationService",
	},
	{
		name: "static-files",
		local: "http://localhost:8094/api/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-static-files/",
		orvalKey: "staticFileService",
	},
	{
		name: "connection-gateway",
		local: "http://localhost:8082/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-connection/",
		orvalKey: "connectionGateway",
	},
	{
		name: "contacts-service",
		local: "http://localhost:8083/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-contacts/",
		orvalKey: "contactService",
	},
	{
		name: "agent-harness",
		local: "http://localhost:8101/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-agent-harness/",
		orvalKey: "agentHarnessService",
	},
	{
		name: "unfurl-service",
		local: "http://localhost:8095/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-unfurl/",
		orvalKey: "unfurlService",
	},
	{
		name: "email-service",
		local: "http://localhost:8087/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-email/",
		orvalKey: "emailService",
	},
	{
		name: "search-service",
		local: "http://localhost:8093/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-search/",
		orvalKey: "searchService",
	},
	{
		name: "scheduled-action",
		local: "http://localhost:8099/api-doc/openapi.json",
		output: "../src/lib/service-clients/service-scheduled-action/",
		orvalKey: "scheduledActionService",
	},
];

export const documentCognitionBase: Service = {
	name: "document-cognition",
	local: "http://localhost:8085",
	output: "../src/lib/service-clients/service-cognition/",
	orvalKey: "cognitionService",
};
