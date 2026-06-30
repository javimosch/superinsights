package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type APIClient struct {
	BaseURL   string
	ProjectID string
	Token     string
	HTTP      *http.Client
}

func NewAPIClient(baseURL, projectID, token string) *APIClient {
	return &APIClient{
		BaseURL:   baseURL,
		ProjectID: projectID,
		Token:     token,
		HTTP: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *APIClient) get(path string, v interface{}) error {
	url := fmt.Sprintf("%s/p/%s/%s%s", c.BaseURL, c.ProjectID, c.Token, path)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return &SIError{
			Code:        110,
			Type:        "internal_error",
			Message:     fmt.Sprintf("failed to create request: %s", err),
			Recoverable: false,
		}
	}

	// Tell the server we want JSON
	req.Header.Set("Accept", "application/json")

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return &SIError{
			Code:    105,
			Type:    "connection_failed",
			Message: fmt.Sprintf("failed to connect to %s: %s", c.BaseURL, err),
			Suggestions: []string{
				"Check SI_API_URL is correct",
				"Check your network connection",
			},
			Recoverable: true,
		}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &SIError{
			Code:        110,
			Type:        "internal_error",
			Message:     fmt.Sprintf("failed to read response: %s", err),
			Recoverable: false,
		}
	}

	if resp.StatusCode == 404 {
		return &SIError{
			Code:    92,
			Type:    "resource_not_found",
			Message: "project or resource not found (check SI_PROJECT_ID and SI_TOKEN)",
			Suggestions: []string{
				"Verify SI_PROJECT_ID is correct",
				"Verify SI_TOKEN is correct (project settings → public link)",
				"Ensure public link is enabled in project settings",
			},
			Recoverable: false,
		}
	}

	if resp.StatusCode == 429 {
		var retryAfter int
		fmt.Sscanf(resp.Header.Get("Retry-After"), "%d", &retryAfter)
		return &SIError{
			Code:        100,
			Type:        "rate_limited",
			Message:     "rate limited, wait before retrying",
			Recoverable: true,
			RetryAfter:  &retryAfter,
		}
	}

	if resp.StatusCode != 200 {
		return &SIError{
			Code:        100,
			Type:        "api_error",
			Message:     fmt.Sprintf("API returned status %d", resp.StatusCode),
			Recoverable: true,
		}
	}

	// The /dashboard/data endpoint wraps in {success, data}
	// while events/pageviews/errors return direct JSON
	// Try wrapped format first, fall back to direct
	var wrapper struct {
		Success bool            `json:"success"`
		Data    json.RawMessage `json:"data"`
		Error   string          `json:"error,omitempty"`
	}

	if err := json.Unmarshal(body, &wrapper); err == nil && wrapper.Success && wrapper.Data != nil {
		return json.Unmarshal(wrapper.Data, v)
	}

	// Direct JSON (events, pageviews, errors endpoints)
	return json.Unmarshal(body, v)
}
