package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

func cmdEvents(args []string) {
	apiURL, projectID, token, timeframe, remaining := parseGlobalFlags(args)
	requireConfig(projectID, token)

	client := NewAPIClient(apiURL, projectID, token)

	isGet := len(remaining) > 0 && remaining[0] == "get"
	isList := len(remaining) > 0 && remaining[0] == "list"

	if isGet {
		if len(remaining) < 2 {
			fail(80, &SIError{
				Code:    80,
				Type:    "invalid_argument",
				Message: "missing event ID: si events get <id>",
				Suggestions: []string{
					"Run `si events list` to find event IDs",
				},
			})
		}
		eventID := remaining[1]
		eventDetails(client, eventID, timeframe)
		return
	}

	eventName := ""
	for i := 0; i < len(remaining); i++ {
		if remaining[i] == "--event" && i+1 < len(remaining) {
			eventName = remaining[i+1]
			break
		}
	}

	if isList && eventName != "" {
		eventDetails(client, eventName, timeframe)
		return
	}

	var data interface{}
	path := fmt.Sprintf("/events?timeframe=%s", timeframe)
	if eventName != "" {
		path = fmt.Sprintf("/events/%s?timeframe=%s", eventName, timeframe)
	}
	if err := client.get(path, &data); err != nil {
		if e, ok := err.(*SIError); ok {
			fail(e.Code, e)
		}
		fail(100, &SIError{Code: 100, Type: "api_error", Message: err.Error()})
	}

	if jsonOutput {
		printJSON(data)
	} else {
		b, _ := json.MarshalIndent(data, "", "  ")
		fmt.Println(string(b))
	}
}

func eventDetails(client *APIClient, eventName, timeframe string) {
	var data interface{}
	path := fmt.Sprintf("/events/%s?timeframe=%s", eventName, timeframe)
	if err := client.get(path, &data); err != nil {
		if e, ok := err.(*SIError); ok {
			fail(e.Code, e)
		}
		fail(100, &SIError{Code: 100, Type: "api_error", Message: err.Error()})
	}

	if jsonOutput {
		printJSON(data)
	} else {
		b, _ := json.MarshalIndent(data, "", "  ")
		fmt.Println(string(b))
		if strings.Contains(eventName, "$click") {
			fmt.Println("\nTip: Use `si autocapture --top` for click analytics")
		}
	}
}
